const jwt  = require('jsonwebtoken')

var userData = {}
exports.isAuth = async event => {
    const authorizerToken = event.authorizationToken
    const authorizerArr = authorizerToken.split(' ')
    const token = authorizerArr[1]

    if (authorizerArr.length !== 2 ||
        authorizerArr[0] !== 'Bearer' ||
        authorizerArr[1].length === 0) {
        return generatePolicy('undefined', 'Deny', event.methodArn)
    }
    try {
        var decodedJwt = jwt.verify(token, process.env.JWT_SECRET)
    }
    catch(err) {
        return generatePolicy('undefined', 'Deny', event.methodArn)
    }
    console.log(decodedJwt)
    if (typeof decodedJwt.email !== 'undefined' &&
    decodedJwt.email.length > 0) {
        userData = decodedJwt
        return generatePolicy(decodedJwt.email, 'Allow', event.methodArn)
    }
    generatePolicy('undefined', 'Deny', event.methodArn)
}

const generatePolicy = function(principalId, effect, resource) {
    let authResponse = {}

    authResponse.principalId = principalId
    if (effect && resource) {
        let policyDocument = {}
        policyDocument.Version = '2012-10-17'
        policyDocument.Statement = []
        let statementOne = {}
        statementOne.Action = 'execute-api:Invoke'
        statementOne.Effect = effect
        statementOne.Resource = "*"
        policyDocument.Statement[0] = statementOne
        authResponse.policyDocument = policyDocument
    }
    authResponse.context = {
        email: principalId,
        userId: userData.id
    }
    return authResponse
}