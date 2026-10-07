import { api, type ReadOptions } from "./api.ts";
import { InvalidResponseError } from "./transport-errors.ts";
import type { ProjectRepository } from "../contracts/api.generated";

/**
 * The repository of a project folder, for the project's Git dialog. Replies
 * are checked against the contract here, so a proxy's page is an unreadable
 * reply and never a repository state.
 */

const states = ["absent", "unpushed", "publishing", "published", "failed"];
const optionalText = (value: unknown) =>
  value === null || typeof value === "string";

function repository(value: unknown): ProjectRepository {
  const candidate = value as Record<string, unknown> | null;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !states.includes(candidate.state as string) ||
    !optionalText(candidate.url) ||
    !optionalText(candidate.error)
  )
    throw new InvalidResponseError(200);
  return candidate as unknown as ProjectRepository;
}

const path = (project: string) => `/api/v1/projects/${project}/repository`;

export async function readRepository(project: string, options?: ReadOptions) {
  return repository(
    await api<unknown>(path(project), "GET", undefined, {}, options),
  );
}

/** Starts a publication unless one runs or the folder is already published. */
export async function publishRepository(project: string) {
  return repository(await api<unknown>(path(project), "POST", {}));
}

/** Only an HTTPS remote is offered as a link. */
export function repositoryLink(state: ProjectRepository | null) {
  const url = state?.url ?? "";
  return url.startsWith("https://") ? url.replace(/\.git$/, "") : "";
}

/** What the owner reads about a repository state, in Polish. */
export function repositoryStatus(state: ProjectRepository) {
  const labels: Record<ProjectRepository["state"], string> = {
    absent: "Projekt nie ma jeszcze repozytorium na GitHubie.",
    unpushed: "Repozytorium jest podpięte, ale nic do niego nie wysłano.",
    publishing: "Tworzenie prywatnego repozytorium na GitHubie…",
    published: "Projekt jest opublikowany w zdalnym repozytorium.",
    failed: "Nie udało się opublikować projektu na GitHubie.",
  };
  return labels[state.state];
}
