import PocketBase from 'pocketbase';

const PB_URL = import.meta.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';

export const pb = new PocketBase(PB_URL);

// Persist auth across page reloads (PocketBase SDK handles this via localStorage)
pb.autoCancellation(false);
