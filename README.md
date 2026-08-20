# 📅 Schedule Workflow Runs Action

Schedule your GitHub Actions workflows to run at a future date and time! 🤯

This works using the [`schedule`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule) event to poll GitHub variables which are used as our database for scheduling.

<details>
<summary>Flow Diagram</summary>

```mermaid
flowchart LR
    A([`workflow_dispatch`]) --> H[Create scheduled workflow]
    W([`schedule`]) ---> I
    B([`other`]) ---> I
    H --> I[Fetch scheduled workflows]
    I --> P((For Each\nscheduled\nworkflow))
    P --> Q{Is it time to run\nscheduled workflow?}
    Q --> |yes| R[Run scheduled workflow]
    R --> S[Delete scheduled workflow]
    S --> V{Have we waited\n`wait-ms`?}
    V --> |no| T[Wait\n`wait-delay-ms`]
    T --> I
    V --> |yes| U[Write job summary]
    Q --> |no| V
```

</details>

https://github.com/austenstone/schedule/assets/22425467/040aa351-cf1a-40e2-99e9-98de5de192bc

## Usage

Create a workflow (eg: `.github/workflows/schedule.yml`) and copy the [example](#-example) below. Ensure you've setup the [authentication](#-authentication) and [inputs](#%EF%B8%8F-inputs) correctly.

### ⚠️ Runner requirements

`v1.4` and the floating `v1` tag run on the **Node 24** Actions runtime. GitHub-hosted
runners have defaulted to Node 24 since June 2026, so if you use `ubuntu-latest`,
`windows-latest`, or `macos-latest` there is nothing to do.

Node 24 is **not** available everywhere, though. Per GitHub's
[Node 20 deprecation notice](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/),
it does not support:

| Environment | Status |
| - | - |
| macOS 13.4 and older | ❌ Not supported |
| Self-hosted ARM32 runners | ❌ No official Node 24 build |

If you're on either of those, pin to [`v1.3`](https://github.com/austenstone/schedule/releases/tag/v1.3),
the last release that runs on `node20`:

```yml
      - uses: austenstone/schedule@v1.3
```

Be aware of what you give up: `v1.3` predates the fix for due workflows being
skipped, so when two or more schedules come due in the same poll it only
dispatches every other one. The rest wait for the next poll. It is not affected
by the `v1.3`–`main` scheduling outage fixed in v1.4.

Node 20 is scheduled for removal from GitHub-hosted runners in fall 2026, so
treat `v1.3` as a stopgap rather than a destination.

### 🔑 Authentication

#### GitHub App

* [Create a GitHub App](https://github.com/settings/apps/new?name=actions-scheduler&description=Schedule%20GitHub%20Actions%20runs.&url=https://github.com&public=false&actions=write&actions_variables=write&webhook_active=false) with the `actions` & `actions_variables` scope.
* Use the [actions/create-github-app-token](https://github.com/actions/create-github-app-token?tab=readme-ov-file#create-github-app-token) action to create a GitHub App token to generate a token.

#### Personal Access Token (PAT)

You need to create a Personal Access Token (PAT) with the `repo` scope and add it to your repository secrets.

##### Fine-grained access tokens

The token must have the following permission set:

* `actions_variables:write`
* `actions:write`

### ⏩ Example

<img align="right" src="https://github.com/austenstone/schedule/assets/22425467/c0e844ec-11b2-4449-919d-c03786ff066a" width="250px">

This workflow runs on a [`schedule`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule) event every hour and spends <1min checking the schedule for any pending workflows to run.

To schedule a workflow, manually do a [`workflow_dispatch`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch) by going to "Actions > 📅 Schedule Workflow Dispatch", type when you want the workflow to run, and click Run workflow.

#### Inputs

* Replace the `workflow` input with the name, path, or id of the workflow you want to run
* Change the `timezone` input to your timezone

> [!IMPORTANT]  
> Make sure you've set your PAT to the `TOKEN` secret in your repository settings.

```yml
name: 📅 Schedule Workflow Dispatch
on:
  schedule:
    - cron: '0 */1 * * *' # every hour
  workflow_dispatch:
    inputs:
      date:
        description: 'Date to run the workflow'
        required: true
        type: string
        default: 'in 1 hour'
concurrency:
  group: schedule${{ github.event.inputs.date }}
  cancel-in-progress: true

permissions: {}

jobs:
  schedule:
    name: 📅 Schedule
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: austenstone/schedule@v1
        with:
          github-token: ${{ secrets.TOKEN }}
          date: ${{ github.event.inputs.date }}
          workflow: 'basic.yml'
          timezone: 'US/Eastern' # US/Central, US/Pacific
          wait-ms: 45000
```

The job needs no `GITHUB_TOKEN` permissions of its own because scheduling is done
with the `TOKEN` secret, so `permissions: {}` is the correct least privilege here.

#### Where schedules are stored

Schedules live in repository variables named `_SCHEDULE_<workflow-id>_<timestamp>_<uuid>`.
The action creates one when you schedule a workflow and deletes it once the run is
dispatched, so nothing needs cleaning up by hand.

#### Timezone

The timezone is set to `US/Eastern` by default. You can change this to your timezone. EX: `US/Central`, `US/Pacific`, [etc](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).

```yml
          timezone: 'US/Eastern'
```

#### Changing when to check the schedule

The [`schedule`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule) event is used to check for scheduled workflow runs. You can change the cron to run at a different interval.

```yml
on:
  schedule:
    - cron: '0 */1 * * *'
```

The action also has the ability to continue running the workflow and polling for a specific amount of time. This is useful if you want to run the workflow at a specific time and then continue running the workflow for a specific amount of time.

In the example below we spend 5 minutes checking the schedule every 20 seconds:

```yml
        with:
          wait-ms: 300000 # Check for 5 minutes
          wait-delay-ms: 20000 # Wait 20 seconds between checks
```

> [!TIP]
> You may want to consider that for billing GitHub jobs are rounded up to the nearest minute.

#### Selecting the workflow to run

Pass in the workflow you want to run. This can be the name, path, or id of the workflow.

```yml
          workflow: 'basic.yml'
```

You could provide options for workflows to run. This does interfere with the workflow inputs you might want to pass in.

```yml

      workflow:
        description: 'Workflow to run at schedule time'
        required: true
        type: choice
        options:
          - 'basic.yml'
          - 'codeql.yml'
...
        with:
          workflow: ${{ inputs.workflow }}
```     

#### Passing Workflow Inputs

You can provide the [`workflow_dispatch`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch) inputs you want to provide by using the `inputs` input.

```yml
        with:
          inputs: '{"name": "Austen"}'
```

or from the inputs themselves.

```yml
        with:
          inputs: ${{ toJson(github.event.inputs) }}
```

### ➡️ Inputs
Various inputs are defined in [`action.yml`](action.yml):

| Name | Description | Default |
| --- | - | - |
| *github-token* | The GitHub token used to create an authenticated client | ${{ github.token }} |
| *workflow* | Workflow to run at schedule time |  |
| date | Date to run the workflow | ${{ github.event.inputs.date }} |
| wait-ms | Milliseconds to wait | 0 |
| wait-delay-ms | Milliseconds to wait between checks on the schedule | 20000 |
| ref | Branch to run the workflow on | ${{ github.ref }} |
| owner | Optional repository owner to run the workflow on. | ${{ github.repository_owner }} |
| repo | Optional repository name to run the workflow on. | ${{ github.repository }} |
| timezone | Timezone to use for the schedule | US/Eastern |
| inputs | Inputs to pass to the workflow | ${{ toJson(github.event.inputs) }} |
| inputs-ignore | Inputs to ignore when passing to the workflow | date,workflow |

<!-- 
## ⬅️ Outputs
| Name | Description |
| --- | - |
| output | The output. |
-->

## Further help
To get more help on the Actions see the [documentation](https://docs.github.com/en/actions).
