/* 브라우저에 공개되는 설정만 둔다. (Client Secret 등 비밀값은 절대 넣지 말 것)
 * naverMapKeyId: 네이버 클라우드 플랫폼 > Maps > Application 의 Client ID(Key ID).
 *   - Dynamic Map 서비스가 선택되어 있어야 하고, Web 서비스 URL에 http://localhost:8765 등 접속 주소를 등록해야 한다.
 *   - 비워 두거나 인증에 실패하면 OpenStreetMap(Leaflet) 지도로 자동 대체된다.
 */
window.DASH_CONFIG = {
  naverMapKeyId: "p7s9o27fix",
};
