import { info } from "@actions/core";
import { GitHub } from "@actions/github/lib/utils";

interface NodeField {
  id: string;
  name: string;
}

interface Node {
  id: string;
  title: string;
  fields: {
    nodes: NodeField[];
  };
}

interface ProjectsV2 {
  nodes: Node[];
}

interface Repository {
  projectsV2: ProjectsV2;
}

interface Data {
  repository: Repository;
}

interface RootObject {
  data: Data;
}

export const getProjects = async (octokit: InstanceType<typeof GitHub>, owner: string, repo: string, projectName: string): Promise<RootObject> => {
  const query = `{
    repository(owner: "${owner}", name: "${repo}") {
      projectsV2(query: "name:${projectName}", first: 10) {
        nodes {
          id
          title
          fields(first: 20) {
            nodes {
              ... on ProjectV2Field {
                id
                name
              }
            }
          }
        }
      }
    }
  }`;
  info(`Query: ${query}`)
  return octokit.graphql(query)
};
