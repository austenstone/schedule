import { test } from '@jest/globals';
import * as main from '../src/index'

const runMock = jest.spyOn(main, 'run').mockImplementation()

test('test run', () => {
  it('calls run when imported', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    import('../src/index')
    expect(runMock).toHaveBeenCalled()
  })
});