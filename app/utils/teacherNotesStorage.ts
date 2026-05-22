// IndexedDB storage for teacher-annotated session ZIPs and session PDFs.
// sessionStorage has a ~5 MB quota which overflows for large PDFs.
// IndexedDB stores raw Blobs with no practical size limit.

const DB_NAME = "sopra-teacher-notes";
const STORE = "notes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeTeacherNotes(sessionId: number, blob: Blob, name: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ blob, name }, `teacher_notes_${sessionId}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function retrieveTeacherNotes(sessionId: number): Promise<{ blob: Blob; name: string } | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(`teacher_notes_${sessionId}`);
    req.onsuccess = () => { db.close(); resolve((req.result as { blob: Blob; name: string }) ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

// ── Session PDF storage ────────────────────────────────────────────────────

export async function storeSessionPdf(sessionId: number, file: File): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ blob: file, name: file.name }, `pdf_session_${sessionId}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function retrieveSessionPdf(sessionId: string | number): Promise<File | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(`pdf_session_${sessionId}`);
    req.onsuccess = () => {
      const r = req.result as { blob: Blob; name: string } | undefined;
      db.close();
      resolve(r ? new File([r.blob], r.name, { type: "application/pdf" }) : null);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function deleteSessionPdf(sessionId: string | number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(`pdf_session_${sessionId}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}

// ── Student local file storage ─────────────────────────────────────────────
// Stores the student's private PDFs ("My Files") keyed by sessionId + userId.
// Kept in IndexedDB so they survive page refreshes without sharing to backend.

type StudentFileEntry = { blob: Blob; name: string; type: string };

export async function storeStudentLocalFiles(sessionId: number | string, userId: number | string, files: File[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const entries: StudentFileEntry[] = files.map(f => ({ blob: f, name: f.name, type: f.type }));
    tx.objectStore(STORE).put(entries, `student_files_${sessionId}_${userId}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function retrieveStudentLocalFiles(sessionId: number | string, userId: number | string): Promise<File[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(`student_files_${sessionId}_${userId}`);
    req.onsuccess = () => {
      db.close();
      const entries = req.result as StudentFileEntry[] | undefined;
      if (!entries) { resolve([]); return; }
      resolve(entries.map(e => new File([e.blob], e.name, { type: e.type })));
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}