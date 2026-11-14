/**
 * Idempotent deploy of the ingest function to AWS Lambda (free tier: 1M
 * requests + 400k GB-s per month). Safe to run repeatedly: it creates what is
 * missing and updates what exists.
 *
 *   1. IAM execution role (CloudWatch Logs only)
 *   2. Lambda function (Node 22, x86_64): created, or code + config updated
 *   3. Public Function URL with CORS restricted to the dashboard origin(s)
 *
 * Needs AWS credentials from the standard chain (env vars or ~/.aws) and
 * DATABASE_URL + INGEST_ALLOWED_ORIGINS in ../.env (see .env.example).
 *
 *   npm run deploy
 */
import {
  AttachRolePolicyCommand,
  CreateRoleCommand,
  GetRoleCommand,
  IAMClient,
} from '@aws-sdk/client-iam';
import {
  AddPermissionCommand,
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  UpdateFunctionUrlConfigCommand,
  waitUntilFunctionActiveV2,
  waitUntilFunctionUpdatedV2,
} from '@aws-sdk/client-lambda';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME ?? 'sla-ingest';
const ROLE_NAME = `${FUNCTION_NAME}-role`;
const REGION = process.env.AWS_REGION ?? 'ap-south-1';
const ORIGINS = (process.env.INGEST_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (put it in the repo-root .env).');
if (ORIGINS.length === 0) throw new Error('INGEST_ALLOWED_ORIGINS is not set, e.g. "https://your-app.vercel.app".');

const lambdaRoot = fileURLToPath(new URL('..', import.meta.url));
const iam = new IAMClient({ region: REGION });
const lambda = new LambdaClient({ region: REGION });

const notFound = (err) => err.name === 'ResourceNotFoundException' || err.name === 'NoSuchEntityException';
const step = (msg) => console.log(`\n> ${msg}`);

const functionConfig = {
  Runtime: 'nodejs22.x',
  Handler: 'src/handler.handler',
  MemorySize: 1024, // more memory = more CPU; parsing 15k rows takes ~1s
  Timeout: 60,
  Environment: { Variables: { DATABASE_URL: process.env.DATABASE_URL, NODE_OPTIONS: '--enable-source-maps' } },
};

async function ensureRole() {
  step(`IAM role ${ROLE_NAME}`);
  try {
    const { Role } = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
    console.log('  exists');
    return { arn: Role.Arn, created: false };
  } catch (err) {
    if (!notFound(err)) throw err;
  }
  const { Role } = await iam.send(
    new CreateRoleCommand({
      RoleName: ROLE_NAME,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }],
      }),
    }),
  );
  await iam.send(
    new AttachRolePolicyCommand({
      RoleName: ROLE_NAME,
      PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    }),
  );
  console.log('  created; waiting for IAM propagation...');
  await new Promise((r) => setTimeout(r, 12000));
  return { arn: Role.Arn, created: true };
}

async function ensureFunction(roleArn, zipFile) {
  step(`Lambda function ${FUNCTION_NAME} (${REGION})`);
  let exists = true;
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
  } catch (err) {
    if (!notFound(err)) throw err;
    exists = false;
  }

  if (!exists) {
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: FUNCTION_NAME,
        Role: roleArn,
        Code: { ZipFile: zipFile },
        Architectures: ['x86_64'],
        Description: 'Parses, validates, cleans and persists SLA health-check CSV uploads',
        ...functionConfig,
      }),
    );
    await waitUntilFunctionActiveV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: FUNCTION_NAME });
    console.log('  created');
    return;
  }

  await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: FUNCTION_NAME, ZipFile: zipFile }));
  await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: FUNCTION_NAME });
  await lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: FUNCTION_NAME, ...functionConfig }));
  await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: FUNCTION_NAME });
  console.log('  code and configuration updated');
}

async function ensureFunctionUrl() {
  step('Function URL');
  const Cors = {
    AllowOrigins: ORIGINS,
    AllowMethods: ['GET', 'POST'],
    AllowHeaders: ['content-type', 'x-file-name'],
    MaxAge: 86400,
  };
  let url;
  try {
    ({ FunctionUrl: url } = await lambda.send(
      new UpdateFunctionUrlConfigCommand({ FunctionName: FUNCTION_NAME, AuthType: 'NONE', Cors }),
    ));
    console.log('  CORS updated');
  } catch (err) {
    if (!notFound(err)) throw err;
    ({ FunctionUrl: url } = await lambda.send(
      new CreateFunctionUrlConfigCommand({ FunctionName: FUNCTION_NAME, AuthType: 'NONE', Cors }),
    ));
    console.log('  created');
  }

  // Public invoke permissions. Function URLs need both statements.
  const permissions = [
    { StatementId: 'public-function-url', Action: 'lambda:InvokeFunctionUrl', FunctionUrlAuthType: 'NONE' },
    { StatementId: 'public-function-url-invoke', Action: 'lambda:InvokeFunction', InvokedViaFunctionUrl: true },
  ];
  for (const p of permissions) {
    try {
      await lambda.send(new AddPermissionCommand({ FunctionName: FUNCTION_NAME, Principal: '*', ...p }));
    } catch (err) {
      if (err.name !== 'ResourceConflictException') throw err; // already granted
    }
  }
  return url;
}

step('Packaging');
execSync('node scripts/package.mjs', { cwd: lambdaRoot, stdio: 'inherit' });
const zipFile = readFileSync(new URL('../build/lambda.zip', import.meta.url));

const role = await ensureRole();
await ensureFunction(role.arn, zipFile);
const url = await ensureFunctionUrl();

step('Smoke test');
const res = await fetch(url);
console.log(`  GET ${url} -> ${res.status} ${await res.text()}`);
console.log(`\nDone. Set NEXT_PUBLIC_INGEST_URL=${url} in the web app's environment.`);
