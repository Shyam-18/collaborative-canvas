// server/rooms.ts
import { v4 as uuid } from "uuid";
import { createDrawingState } from "./drawing-state";

const PALETTE = Array.from({ length: 24 }, (_, i) => `hsl(${(i * 360) / 24} 80% 50%)`);

type User = { userId: string; color: string };
type Room = {
  id: string;
  users: Map<string, User>;
  nextColor: number;
  state: ReturnType<typeof createDrawingState>;
};

export function createRoomsManager() {
  const rooms = new Map<string, Room>();

  function getRoom(roomId: string): Room {
    let r = rooms.get(roomId);
    if (!r) {
      r = {
        id: roomId,
        users: new Map(),
        nextColor: 0,
        state: createDrawingState(roomId),
      };
      rooms.set(roomId, r);
    }
    return r;
  }

  function addUser(roomId: string): User {
    const room = getRoom(roomId);
    const userId = uuid();
    const color = PALETTE[room.nextColor++ % PALETTE.length];
    const u = { userId, color };
    room.users.set(userId, u);
    return u;
  }

  function removeUser(roomId: string, userId: string) {
    const room = getRoom(roomId);
    room.users.delete(userId);
  }

  function listUsers(roomId: string): User[] {
    return Array.from(getRoom(roomId).users.values());
  }

  function getState(roomId: string) {
    return getRoom(roomId).state;
  }

  return { getRoom, addUser, removeUser, listUsers, getState };
}
