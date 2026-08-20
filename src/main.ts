import { setFailed } from '@actions/core';
import { run } from './index';

run().catch((error) => {
  setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`);
});
