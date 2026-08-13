const loginAttempts = new Map();

const MAX_LOGIN_ATTEMPTS = 5;

const LOGIN_BLOCK_DURATION_MS = 10 * 60 * 1000;


function getLoginAttempt(attemptKey) {

    const attemptInfo = loginAttempts.get(attemptKey);

    if (!attemptInfo) {
        return null;
    }

    if (
        attemptInfo.blockedUntil &&
        attemptInfo.blockedUntil <= Date.now()
    ) {
        loginAttempts.delete(attemptKey);

        return null;
    }
    return attemptInfo;
}

function isLoginBlocked(attemptKey) {

    const attemptInfo = getLoginAttempt(attemptKey);

    return Boolean(
        attemptInfo &&
        attemptInfo.blockedUntil &&
        attemptInfo.blockedUntil > Date.now()
    );
}

function registerFailedLogin(attemptKey) {

    const currentAttempt = getLoginAttempt(attemptKey);

    const failedAttempts = currentAttempt ? currentAttempt.failedAttempts + 1 : 1;

    if (
        failedAttempts >=
        MAX_LOGIN_ATTEMPTS
    ) {

        loginAttempts.set(
            attemptKey,
            {
                failedAttempts,
                blockedUntil:
                    Date.now() +
                    LOGIN_BLOCK_DURATION_MS
            }
        );
        return true;
    }

    loginAttempts.set(
        attemptKey,
        {
            failedAttempts,
            blockedUntil: null
        }
    );
    return false;
}

function clearLoginAttempts(attemptKey) {

    loginAttempts.delete(attemptKey);
}

module.exports = {
    isLoginBlocked,
    registerFailedLogin,
    clearLoginAttempts
};