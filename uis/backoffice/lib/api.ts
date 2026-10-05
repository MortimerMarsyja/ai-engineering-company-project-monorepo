import type {
  Candidate,
  CandidateNote,
  CandidatePatch,
  CandidatesResponse,
  CandidateStatus,
  CandidateStage,
  NoteCreate,
  NotesResponse,
  RecordCreate,
} from "./types";
import { authenticatedFetch } from "./authenticated-fetch";
import {
  ACCESS_DENIED_ACTION_MESSAGE,
  ACCESS_DENIED_MESSAGE,
  ACTION_UNAVAILABLE_MESSAGE,
  ApiError,
} from "./api-error";

interface FetchCandidatesParams {
  page?: number;
  limit?: number;
  search?: string;
  statuses?: CandidateStatus[];
  stages?: CandidateStage[];
}

/** Build a clean, user-friendly error for a failed response — never a raw
 * status code or stack trace. 403 always gets the "wrong role" message:
 * no amount of retrying changes what a role is allowed to do. */
async function buildApiError(
  res: Response,
  fallback: string,
  options?: { notFound?: string; forbidden?: string },
): Promise<ApiError> {
  if (res.status === 403) {
    return new ApiError(options?.forbidden ?? ACCESS_DENIED_MESSAGE, 403);
  }
  if (res.status === 405) {
    return new ApiError(ACTION_UNAVAILABLE_MESSAGE, 405);
  }
  if (res.status === 404 && options?.notFound) {
    return new ApiError(options.notFound, 404);
  }
  const body = await res.json().catch(() => null);
  const detail = body?.detail;
  const message = typeof detail === "string" && detail.trim() ? detail : fallback;
  return new ApiError(message, res.status);
}

export async function fetchCandidates({
  page = 1,
  limit = 20,
  search,
  statuses,
  stages,
}: FetchCandidatesParams = {}): Promise<CandidatesResponse> {
  const params = new URLSearchParams();

  params.set("page", String(page));
  params.set("limit", String(limit));
  if (search) {
    params.set("search", search);
  }

  const res = await authenticatedFetch(`/api/proxy/records?${params.toString()}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't load candidates right now. Please try again.");
  }

  let result = (await res.json()) as CandidatesResponse;
  result.data = result?.data ?? [];

  if (statuses && statuses.length > 0) {
    result.data = result.data.filter((c) => statuses.includes(c.status));
    result.total = result.data.length;
  }

  if (stages && stages.length > 0) {
    result.data = result.data.filter((c) => stages.includes(c.stage));
    result.total = result.data.length;
  }

  return result;
}

export async function fetchCandidate(id: string): Promise<Candidate> {
  const res = await authenticatedFetch(`/api/proxy/records/${id}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't load this candidate. Please try again.", {
      notFound: "We couldn't find this candidate. It may have been removed.",
    });
  }

  return (await res.json()) as Candidate;
}

export async function patchCandidate(
  id: string,
  body: CandidatePatch,
): Promise<Candidate> {
  const res = await authenticatedFetch(`/api/proxy/records/${id}`, {
    method: "PATCH",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't update this candidate. Please try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }

  return (await res.json()) as Candidate;
}

export async function fetchNotes(id: string): Promise<CandidateNote[]> {
  const res = await authenticatedFetch(`/api/proxy/records/${id}/notes`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't load notes for this candidate.");
  }

  const result = (await res.json()) as NotesResponse;
  return result?.data ?? [];
}

export async function createNote(
  id: string,
  body: NoteCreate,
): Promise<CandidateNote> {
  const res = await authenticatedFetch(`/api/proxy/records/${id}/notes`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't add this note. Please try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }

  return (await res.json()) as CandidateNote;
}

export async function deleteNote(id: string, noteId: string): Promise<void> {
  const res = await authenticatedFetch(`/api/proxy/records/${id}/notes/${noteId}`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't delete this note. Please try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }
}

export async function createCandidate(
  body: RecordCreate,
): Promise<Candidate> {
  const res = await authenticatedFetch(`/api/proxy/records`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't add this candidate. Please check the details and try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }

  return (await res.json()) as Candidate;
}

export async function updateCandidate(
  id: string,
  body: RecordCreate,
): Promise<Candidate> {
  const res = await authenticatedFetch(`/api/proxy/records/${id}`, {
    method: "PUT",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't save these changes. Please try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }

  return (await res.json()) as Candidate;
}
