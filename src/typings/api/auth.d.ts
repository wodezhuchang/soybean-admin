declare namespace Api {
  /**
   * namespace Auth
   *
   * backend api module: "auth"
   */
  namespace Auth {
    interface LoginToken {
      token: string;
      refreshToken: string;
    }

    interface UserInfo {
      userId: string;
      userName: string;
      roles: string[];
      buttons: string[];
      /** 多角色改造：admin / student / teacher */
      role?: string;
      /** real / sandbox */
      accountType?: string;
      org?: string;
    }
  }
}
