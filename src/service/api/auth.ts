import { request } from '../request';
import { localStg } from '@/utils/storage';

/** 多角色改造：真实后端登录地址（Vite 代理 /proxy-default → 127.0.0.1:8000） */
const AUTH_BASE = '/proxy-default/api/auth';

/**
 * Login —— 调真实后端 POST /api/auth/login，返回 { token, user }
 *
 * @param userName User name
 * @param password Password
 */
export async function fetchLogin(userName: string, password: string) {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: userName, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      error: { message: data.detail || '用户名或密码错误' },
      data: null as unknown as Api.Auth.LoginToken
    };
  }
  return {
    data: { token: data.token, refreshToken: '' },
    error: null
  };
}

/**
 * Get user info —— 调真实后端 GET /api/auth/me（Bearer token）
 */
export async function fetchGetUserInfo() {
  const token = localStg.get('token');
  const res = await fetch(`${AUTH_BASE}/me`, {
    headers: { Authorization: token ? `Bearer ${token}` : '' }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      error: { message: data.detail || '获取用户信息失败' },
      data: null as unknown as Api.Auth.UserInfo
    };
  }
  const u = data.user || {};
  return {
    data: {
      userId: u.user_id || '',
      userName: u.name || u.username || '',
      roles: u.role ? [u.role] : [],
      buttons: [],
      role: u.role,
      accountType: u.account_type,
      org: u.org
    },
    error: null
  };
}

/**
 * Refresh token
 *
 * @param refreshToken Refresh token
 */
export function fetchRefreshToken(refreshToken: string) {
  return request<Api.Auth.LoginToken>({
    url: '/auth/refreshToken',
    method: 'post',
    data: {
      refreshToken
    }
  });
}

/**
 * return custom backend error
 *
 * @param code error code
 * @param msg error message
 */
export function fetchCustomBackendError(code: string, msg: string) {
  return request({ url: '/auth/error', params: { code, msg } });
}
