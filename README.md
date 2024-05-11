# Action

Schedule your workflows to run at a future date and time.

This works using the `schedule` event to poll GitHub variables which are used as a database.

## Usage
Create a workflow (eg: `.github/workflows/schedule.yml`). See [Creating a Workflow file](https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file).

### Authentication

#### Example

This workflow runs on a `schedule` event every hour and checks the schedule for any pending workflows to run.

To schedule a workflow, manually do a `workflow_dispatch` by going to "Actions > 📅 Schedule Workflow Dispatch", type when you want the workflow to run, and click Run workflow.

To use this workflow you want to replace the `workflow` input with the name, path, or id of the workflow you want to run. You should also change the `timezone` input to your timezone.

Make sure you've set your PAT to the `TOKEN` secret in your repository settings.

```yml
name: 📅 Schedule Workflow Dispatch
on:
  push:
  pull_request:
  schedule:
    - cron: '0 */1 * * *'
  workflow_dispatch:
    inputs:
      date:
        description: 'Date to run the workflow'
        required: true
        type: string
        default: '2024-05-11'
concurrency:
  group: 'schedule'
  cancel-in-progress: true

jobs:
  schedule:
    name: 📅 Schedule
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./
        id: check
        with:
          github-token: ${{ secrets.TOKEN }}
          date: ${{ github.event.inputs.date }}
          workflow: 'basic.yml'
          timezone: 'EST'
```

## ➡️ Inputs
Various inputs are defined in [`action.yml`](action.yml):

| Name | Description | Default |
| --- | - | - |
| github&#x2011;token | Token to use to authorize. | ${{&nbsp;github.token&nbsp;}} |

<!-- 
## ⬅️ Outputs
| Name | Description |
| --- | - |
| output | The output. |
-->

## Further help
To get more help on the Actions see [documentation](https://docs.github.com/en/actions).

