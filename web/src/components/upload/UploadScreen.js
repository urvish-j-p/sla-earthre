'use client';

import {
  CheckCircleFilled,
  CloudServerOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Card, Progress, Steps, Tag, Typography, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { fmtBytes } from '@/lib/format';
import UploadResult from './UploadResult';

const INGEST_URL = process.env.NEXT_PUBLIC_INGEST_URL;
const MAX_BYTES = 5 * 1024 * 1024; // must match the Lambda limit

/**
 * POST the raw file to the ingest Lambda with upload progress. XHR rather than
 * fetch, because fetch has no upload-progress events.
 */
function sendToLambda(blob, fileName, { onProgress, onUploaded }) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', INGEST_URL);
    xhr.setRequestHeader('content-type', 'text/csv');
    xhr.setRequestHeader('x-file-name', encodeURIComponent(fileName));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.upload.onload = onUploaded;
    xhr.onerror = () => reject(new Error('Could not reach the ingest function. Check your connection or the Function URL / CORS settings.'));
    xhr.ontimeout = () => reject(new Error('The ingest function timed out.'));
    xhr.timeout = 90_000;
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve({ body, elapsedMs: Math.round(performance.now() - started) });
      else {
        const err = new Error(body.error ?? `Ingest failed with HTTP ${xhr.status}`);
        err.details = body.details;
        err.status = xhr.status;
        reject(err);
      }
    };
    xhr.send(blob);
  });
}

export default function UploadScreen() {
  const { message } = App.useApp();
  const [phase, setPhase] = useState('idle'); // idle | uploading | processing | done | error
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [samples, setSamples] = useState([]);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    fetch('/samples/manifest.json')
      .then((r) => (r.ok ? r.json() : []))
      .then(setSamples)
      .catch(() => setSamples([]));
  }, []);

  const busy = phase === 'uploading' || phase === 'processing';

  async function ingest(blob, name) {
    if (!INGEST_URL) {
      message.error('NEXT_PUBLIC_INGEST_URL is not configured.');
      return;
    }
    if (!/\.csv$/i.test(name)) {
      message.error('Please choose a .csv file.');
      return;
    }
    if (blob.size > MAX_BYTES) {
      message.error(`File is ${fmtBytes(blob.size)}; the limit is 5 MB.`);
      return;
    }

    setFile({ name, size: blob.size });
    setResult(null);
    setError(null);
    setProgress(0);
    setPhase('uploading');
    try {
      const { body, elapsedMs: ms } = await sendToLambda(blob, name, {
        onProgress: setProgress,
        onUploaded: () => setPhase('processing'),
      });
      setElapsedMs(ms);
      setResult(body);
      setPhase('done');
    } catch (err) {
      setError(err);
      setPhase('error');
    }
  }

  async function trySample(sample) {
    const res = await fetch(`/samples/${sample.name}`);
    if (!res.ok) {
      message.error('Could not load the sample file.');
      return;
    }
    await ingest(await res.blob(), sample.name);
  }

  const reset = () => {
    setPhase('idle');
    setResult(null);
    setError(null);
    setFile(null);
  };

  const stepIndex = { idle: 0, uploading: 0, processing: 1, done: 2, error: 1 }[phase];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Typography.Title level={3} className="mb-1!">
          Upload health-check logs
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="mb-0!">
          The CSV goes straight to a stateless AWS Lambda function. It parses, validates and cleans the data, stores
          it in Postgres, and returns a data-quality report. Re-uploading an identical file is safe: you get the existing
          dataset back.
        </Typography.Paragraph>
      </div>

      {!INGEST_URL && (
        <Alert
          type="error"
          showIcon
          title="Ingest endpoint not configured"
          description="Set NEXT_PUBLIC_INGEST_URL to the Lambda Function URL (or http://localhost:3001 for local development)."
        />
      )}

      <Card>
        <Steps
          current={stepIndex}
          status={phase === 'error' ? 'error' : phase === 'done' ? 'finish' : 'process'}
          items={[
            { title: 'Upload', content: 'Browser → AWS Lambda', icon: phase === 'uploading' ? undefined : <CloudServerOutlined /> },
            { title: 'Process', content: 'Parse · validate · clean · save', icon: <DatabaseOutlined /> },
            { title: 'Ready', content: 'Explore on the dashboard', icon: <CheckCircleFilled /> },
          ]}
        />

        <div className="mt-6">
          {(phase === 'idle' || phase === 'error') && (
            <Upload.Dragger
              accept=".csv,text/csv"
              multiple={false}
              showUploadList={false}
              disabled={busy}
              beforeUpload={(f) => {
                ingest(f, f.name);
                return Upload.LIST_IGNORE; // we handle the request ourselves
              }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag a CSV file here</p>
              <p className="ant-upload-hint">
                Columns: service_id, service_name, timestamp, status_code, latency, latency_unit, agent, region · up to 5 MB
              </p>
            </Upload.Dragger>
          )}

          {busy && file && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">{file.name}</span>
                <span className="text-slate-500">{fmtBytes(file.size)}</span>
              </div>
              <Progress percent={phase === 'processing' ? 100 : progress} status="active" showInfo={phase === 'uploading'} />
              <div className="mt-2 text-sm text-slate-600">
                {phase === 'uploading' ? 'Uploading to AWS Lambda…' : 'Lambda is parsing, cleaning and saving the data…'}
              </div>
            </div>
          )}
        </div>

        {phase === 'error' && error && (
          <Alert
            className="mt-4!"
            type="error"
            showIcon
            title={error.status === 422 ? 'The file was rejected' : 'Upload failed'}
            description={
              <div className="space-y-1">
                <div>{error.message}</div>
                {error.details?.received && (
                  <div className="text-xs">
                    Header received: <code>{error.details.received.join(', ')}</code>
                  </div>
                )}
              </div>
            }
          />
        )}
      </Card>

      {phase === 'done' && result && <UploadResult result={result} elapsedMs={elapsedMs} onReset={reset} />}

      {(phase === 'idle' || phase === 'error') && samples.length > 0 && (
        <Card
          size="small"
          styles={{ title: { whiteSpace: 'normal' } }}
          title={
            <span className="flex items-center gap-2">
              <ExperimentOutlined /> No file at hand? Try one of the provided datasets
            </span>
          }
        >
          <div className="flex flex-wrap gap-2">
            {samples.map((s) => (
              <Button key={s.name} onClick={() => trySample(s)} disabled={busy}>
                {s.days}-day dataset <Tag className="ml-2! mr-0!">{fmtBytes(s.sizeBytes)}</Tag>
              </Button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
