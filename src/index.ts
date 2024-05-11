import { getInput, setOutput } from "@actions/core";
import dayjs from 'dayjs'

interface Input {
  date: string;
}

const getInputs = (): Input => {
  const result = {} as Input;
  result.date = getInput("date");
  return result;
}

export const run = async (): Promise<void> => {
  const inputs = getInputs();
  setOutput('result', dayjs().isAfter(dayjs(inputs.date)));
};

run();
