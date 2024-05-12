# Action

Schedule your workflows to run at a future date and time.

This works using the `schedule` event to poll GitHub variables which are used as a database.

![chrome_9FPx3g6KF6](https://github.com/austenstone/schedule/assets/22425467/163e516a-e959-43e6-a867-9527f5de034f)

## Usage
Create a workflow (eg: `.github/workflows/schedule.yml`). See [Creating a Workflow file](https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file).

### Authentication

#### GitHub App
Use the [actions/create-github-app-token](https://github.com/actions/create-github-app-token?tab=readme-ov-file#create-github-app-token) action to create a GitHub App token and add it to your repository secrets as `TOKEN`.

#### Personal Access Token (PAT)
You need to create a Personal Access Token (PAT) with the `repo` scope and add it to your repository secrets as `TOKEN`.

### Example

This workflow runs on a `schedule` event every hour and checks the schedule for any pending workflows to run.

To schedule a workflow, manually do a `workflow_dispatch` by going to "Actions > 📅 Schedule Workflow Dispatch", type when you want the workflow to run, and click Run workflow.

To use this workflow you want to replace the `workflow` input with the name, path, or id of the workflow you want to run. You should also change the `timezone` input to your timezone.

Make sure you've set your PAT to the `TOKEN` secret in your repository settings.

```yml
name: 📅 Schedule Workflow Dispatch
on:
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
      - uses: austenstone/schedule@main
        id: check
        with:
          github-token: ${{ secrets.TOKEN }}
          date: ${{ github.event.inputs.date }}
          workflow: 'basic.yml'
          timezone: 'EST'
```

#### Changing when to check the schedule

The [`schedule`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule) event is used to check for scheduled workflow runs. You can change the cron to run at a different interval.

```yml
on:
  schedule:
    - cron: '0 */1 * * *'
```

The action also has the ability to continue running the workflow and polling for a specific amount of time. This is useful if you want to run the workflow at a specific time and then continue running the workflow for a specific amount of time.

In the example below we check the schedule every 20 seconds for 5 minutes.

```yml
        with:
          wait-ms: 300000
          wait-delay-ms: 20000
```

You may want to consider that GitHub jobs are rounded up to the nearest minute.

#### Providing Inputs

You can provide inputs to the workflow you want to run by using the `inputs` input.

```yml
        with:
          inputs: '{"name": "Austen"}'
```

or from the `workflow_dispatch` input.

```yml
        with:
          inputs: ${{ toJson(github.event.inputs) }}
```

## ➡️ Inputs
Various inputs are defined in [`action.yml`](action.yml):

| Name | Description | Default |
| --- | - | - |
| github-token | The GitHub token used to create an authenticated client | ${{ github.token }} |
| date | Date to run the workflow | Tomorrow at noon |
| wait-ms | Milliseconds to wait | 0 |
| wait-delay-ms | Milliseconds to wait between checks on the schedule | 20000 |
| workflow | Workflow to run at schedule time |  |
| ref | Branch to run the workflow on | ${{ github.ref }} |
| owner | Optional repository owner to run the workflow on. | ${{ github.repository_owner }} |
| repo | Optional repository name to run the workflow on. | ${{ github.repository }} |
| timezone | Timezone to use for the schedule | EST |
| inputs | Inputs to pass to the workflow |

<!-- 
## ⬅️ Outputs
| Name | Description |
| --- | - |
| output | The output. |
-->

## Further help
To get more help on the Actions see [documentation](https://docs.github.com/en/actions).


