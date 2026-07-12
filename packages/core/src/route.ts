import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import polyline from "@mapbox/polyline";
import { ddb, tableName } from "./db.ts";
import { userPk, USER_ID } from "./user.ts";

/**
 * A route the user drew in the app's course builder. Saved locally so it can be
 * kept without pushing to Garmin, and pushed later. Points are stored as an
 * encoded polyline to keep the item compact.
 */
export type SavedRoute = {
  id: string;
  userId: string;
  name: string;
  polyline: string; // encoded snapped [lat, lon] points (what gets pushed)
  /** Encoded editable anchor points — restored into the builder for editing. */
  waypoints?: string;
  distance: number; // meters
  /** Set once pushed to Garmin as a course, so the list can link to it. */
  garminCourseId?: number;
  createdAt: string;
  updatedAt: string;
};

export type RoutePoint = { lat: number; lon: number };

const sk = (id: string) => `ROUTE#${id}`;

export function encodeRoute(points: RoutePoint[]): string {
  return polyline.encode(points.map((p) => [p.lat, p.lon]));
}

export function decodeRoute(str: string): RoutePoint[] {
  return polyline.decode(str).map(([lat, lon]) => ({ lat, lon }));
}

export async function createRoute(input: {
  name: string;
  points: RoutePoint[];
  waypoints?: RoutePoint[];
  distance: number;
  garminCourseId?: number;
  userId?: string;
}): Promise<SavedRoute> {
  const now = new Date().toISOString();
  const route: SavedRoute = {
    id: randomUUID(),
    userId: input.userId ?? USER_ID,
    name: input.name,
    polyline: encodeRoute(input.points),
    waypoints: input.waypoints ? encodeRoute(input.waypoints) : undefined,
    distance: input.distance,
    garminCourseId: input.garminCourseId,
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: userPk(route.userId), sk: sk(route.id), ...route },
    }),
  );
  return route;
}

/**
 * Overwrite a saved route's geometry/name. Clears garminCourseId — the edited
 * route no longer matches the course already on Garmin, so it must be re-pushed.
 */
export async function updateRoute(
  id: string,
  input: {
    name: string;
    points: RoutePoint[];
    waypoints?: RoutePoint[];
    distance: number;
  },
  userId: string = USER_ID,
): Promise<SavedRoute | undefined> {
  const existing = await getRoute(id, userId);
  if (!existing) return undefined;
  const updated: SavedRoute = {
    ...existing,
    name: input.name,
    polyline: encodeRoute(input.points),
    waypoints: input.waypoints ? encodeRoute(input.waypoints) : undefined,
    distance: input.distance,
    garminCourseId: undefined,
    updatedAt: new Date().toISOString(),
  };
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: userPk(userId), sk: sk(id), ...updated },
    }),
  );
  return updated;
}

export async function listRoutes(
  userId: string = USER_ID,
): Promise<SavedRoute[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":pk": userPk(userId), ":p": "ROUTE#" },
    }),
  );
  const items = (res.Items ?? []) as SavedRoute[];
  // Newest first (sk is a uuid, so sort on the timestamp we store).
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRoute(
  id: string,
  userId: string = USER_ID,
): Promise<SavedRoute | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: sk(id) },
    }),
  );
  return res.Item as SavedRoute | undefined;
}

export async function deleteRoute(
  id: string,
  userId: string = USER_ID,
): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: sk(id) },
    }),
  );
}

export async function setRouteGarminId(
  id: string,
  garminCourseId: number,
  userId: string = USER_ID,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: sk(id) },
      UpdateExpression: "SET garminCourseId = :c, updatedAt = :u",
      ExpressionAttributeValues: {
        ":c": garminCourseId,
        ":u": new Date().toISOString(),
      },
    }),
  );
}
