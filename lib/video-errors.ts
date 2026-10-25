export type VideoPlaybackError = {
  kind: 'network' | 'media' | 'timeout' | 'unsupported';
  httpStatus?: number;
};

export function videoErrorMessage(error?: VideoPlaybackError): string {
  if (error?.httpStatus === 401 || error?.httpStatus === 403) {
    return 'Nguồn video hiện không cho phép truy cập. Vui lòng thử lại hoặc liên hệ quản trị viên.';
  }
  if (error?.httpStatus === 404) {
    return 'Không tìm thấy video. Vui lòng liên hệ quản trị viên để cập nhật bài học.';
  }
  if (error?.kind === 'timeout') {
    return 'Video tải quá lâu. Vui lòng kiểm tra kết nối và thử lại.';
  }
  return 'Không tải được video. Vui lòng thử lại hoặc liên hệ quản trị viên.';
}
