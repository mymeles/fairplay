const LOCAL_WEB_ORIGINS = [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];

export const getAllowedCorsOrigins = (): Array<string | RegExp> => {
  const configuredWebOrigin = getOrigin(process.env.WEB_AUTH_COMPLETE_URL);
  if (!configuredWebOrigin) return [...LOCAL_WEB_ORIGINS];

  return [...LOCAL_WEB_ORIGINS, configuredWebOrigin];
};

const getOrigin = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};
