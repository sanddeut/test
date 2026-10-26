// 앱 설치(홈 화면 추가)를 위한 최소 서비스 워커. 캐시하지 않고 항상 네트워크에서 받음
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request));
});
