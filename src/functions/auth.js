require('dotenv').config()
const AWS = require('aws-sdk')
const bcrypt = require('bcryptjs')
const nodemailer = require('nodemailer')
const jwt = require('jsonwebtoken')
const { v4: uuid } = require('uuid')

const { response } = require('../utils/response')

const db = new AWS.DynamoDB.DocumentClient()
// const ses = new AWS.SES()
const sendgridTransport = require('nodemailer-sendgrid-transport')
const transporter = nodemailer.createTransport(
	sendgridTransport({
		auth: {
			api_key: process.env.SENDGRID_KEY
		}
	})
)


const usersTable = process.env.USERS_TABLE

exports.signUp = async event => {
    const body = JSON.parse(event.body)
    const email = body.email
    const name = body.name
    const phoneNo = body.phoneNo
    const password = body.password
    const address = body.address
    try {
        const { Item: user } = await db.get({
            Key: {
                email: email
            },
            TableName: usersTable
        }).promise()
        console.log(user)
        if (user) {
            return response(400, { message: 'User already exist!' })
        }
        const hashedPassword = await bcrypt.hash(password, 12)
        const id = uuid()
        await db.put({
            TableName: usersTable,
            Item: {
                id: id,
                email: email,
                password: hashedPassword,
                name: name,
                phoneNo: phoneNo,
                address: address,
                cart: { items: [] },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        }).promise()
        console.log('User created')
        // const params = {
        //     Destination: {
        //         ToAddresses: [email],
        //     },
        //     Message: {
        //         Body: {
        //             Text: { Data: 'Sign up successfully' }
        //         },
        //         Subject: { Data: 'Welcome To Kitab' }
        //     },
        //     Source: process.env.SENDER_EMAIL
        // }
        // await ses.sendEmail(params).promise()
        // .catch(err => console.log(err))
        await transporter.sendMail({
            to: email,
            from: process.env.SENDER_EMAIL,
            subject: 'Welcome To Kitab',
            html: '<h2>You successfully signed up!</h2>'
        })

        return response(200, { message: 'User Created' })
    } catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.login = async event => {
    const body = JSON.parse(event.body)
    const email = body.email
    const password = body.password
    try {
        const { Item: user } = await db.get({
            TableName: usersTable,
            Key: {
                email: email
            }
        }).promise()
        console.log(user)
        if(user) {
            const isEqual = await bcrypt.compare(password, user.password)
            if(isEqual) {
                const token = jwt.sign({
                    id: user.id,
                    email: user.email
                }, process.env.JWT_SECRET, { expiresIn: '1h' })
                return response(200, { message: 'login successfully', token: token })
            }
            else {
                return response(403, { message: 'incorrect credentials' })
            }
        }
        else {
            return response(404, { message: 'User Not Found' })
        }
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}
exports.sendOTP = async event => {
    try {
        const body = JSON.parse(event.body)
        const email = body.email
        const { Item: user } = await db.get({
            TableName: usersTable,
            Key: {
                email: email
            }
        }).promise()
        if (!user) {
            return response(404, { message: 'Email is not registered' })
        }
        const OTP = Math.floor(100000 + Math.random() * 900000).toString()
        const hashedOTP = await bcrypt.hash(OTP, 12)
        await db.update({
            TableName: usersTable,
            Key: {
                email: email
            },
            UpdateExpression: 'SET OTP = :OTP, expiryOTP = :expiryOTP',
            ExpressionAttributeValues: {
                ':OTP': hashedOTP,
                ':expiryOTP': Date.now() + 600000
            },
            ReturnValues: 'UPDATED_NEW'
        }).promise()

        await transporter.sendMail({
            to: body.email,
            from: process.env.SENDER_EMAIL,
            subject: 'Password reset',
            html: `
                <h2>You requested a password reset</h2>
                <h3>OTP: ${OTP}</h3>
                <h3>Valid for only 10 min.</h3>
            `
        })
        return response(200, { message: 'OTP send to registered E-mail' })
    }
    catch (err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.verifyOTP = async event => {
    const body = JSON.parse(event.body)
    const email = body.email
    const OTP = body.OTP
    try {
        const { Item: user } = await db.get({
            TableName: usersTable,
            Key: {
                email: email
            }
        }).promise()
        if (!user) {
            return response(404, { message: 'Email is not registered' })
        }
        if (user.expiryOTP > Date.now()) {
            const isEqual = await bcrypt.compare(OTP, user.OTP)
            if (isEqual) {
                return response(200, { message: 'Verified' })
            } else {
                return response(400, {message: 'Incorrect OTP'})
            }
            
        }
        else {
            return response(400, {message: 'OTP Expire'})
        }
    }
    catch (err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.resetPassword = async event => {
    const body = JSON.parse(event.body)
    const email = body.email
    const password = body.password
    const OTP = body.OTP
    try {
        const { Item: user } = await db.get({
            TableName: usersTable,
            Key: {
                email: email
            }
        }).promise()
        if (!user) {
            return response(404, { message: 'Email is not registered' })
        }
        if (user.expiryOTP > Date.now()) {
            const isEqual = await bcrypt.compare(OTP, user.OTP)
            if (isEqual) {
                const hashedPassword = await bcrypt.hash(password, 12)
                await db.update({
                    TableName: usersTable,
                    Key: {
                        email: email,
                    },
                    UpdateExpression: 'SET password = :password, updatedAt = :updatedAt',
                    ExpressionAttributeValues: {
                        ':password': hashedPassword,
                        ':updatedAt': new Date().toISOString()
                    },
                    ReturnValues: 'UPDATED_NEW'
                }).promise()
                return response(200, { message: 'Password updated' })
            } else {
                return response(400, {message: 'Incorrect OTP'})
            }
            
        }
        else {
            return response(400, {message: 'OTP Expire'})
        }
    }
    catch (err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.profile = async event => {
    const userEmail = event.requestContext.authorizer.email
    try {
        const { Item: user } = await db.get({
            TableName: usersTable,
            Key: {
                email: userEmail
            }
        }).promise()
        return response(200, {user: user})
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.updateProfile = async event => {
    const body = JSON.parse(event.body)

    const email = event.requestContext.authorizer.email
    const userId = event.requestContext.authorizer.userId

    try {
        const params = {
            TableName: usersTable,
            Key: {
                email: email
            }
        }
        const { Item: user } = await db.get(params).promise() 
        console.log(user)
        if(!user) {
            return response(404, { message: 'user Not Found' })
        }
        if(user.email !== email && user.id !== userId) {
            return response(403, { message: 'Unauthorized' })
        }
        const expressionAttributeValues = {
            ':updatedAt': new Date().toISOString()
        }
        var updatedExpression = `SET `
        Object.keys(body).map(k => {
            expressionAttributeValues[`:${k}`] = body[k]
            updatedExpression += `${k} = :${k}, `
        })
        updatedExpression += 'updatedAt = :updatedAt'
        await db.update({
            ...params,
            UpdateExpression: updatedExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'UPDATED_NEW'
        }).promise()
        return response(200, { message: 'user updated' })
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}