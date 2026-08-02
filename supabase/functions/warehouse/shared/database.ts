
// @ts-nocheck
import { HttpError } from "./http.ts";

export async function one(promise, notFound) {
  const { data, error } = await promise;
  if (error) {
    throw new HttpError(error.code === "23505" ? 409 : 500, error.code === "23505" ? "A record with those details already exists." : error.message);
  }
  if (!data) throw new HttpError(404, notFound);
  return data;
}
export async function many(promise) {
  const { data, error } = await promise;
  if (error) throw new HttpError(500, error.message);
  return data ?? [];
}

export async function oneOrNull(promise) {
  const { data, error } = await promise;
  if (error) throw new HttpError(500, error.message);
  return data;
}

