import { test } from '@jest/globals';
import * as main from '../src/index'

const runMock = jest.spyOn(main, 'run').mockImplementation()

test('run', () => {
  try {
    main.run()
  } catch (error) {
    console.error(error)
  }
  expect(runMock).toHaveBeenCalled()
});