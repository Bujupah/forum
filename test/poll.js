process.env.NODE_ENV = 'test'

let chai = require('chai')
let server = require('../server')
let should = chai.should()

let { sequelize, PollQuestion, PollAnswer, PollVote, User } = require('../models')

const Errors = require('../lib/errors.js')

chai.use(require('chai-http'))
chai.use(require('chai-things'))

describe('Poll', () => {
	let admin = chai.request.agent(server)
	let user1 = chai.request.agent(server)
	let user2 = chai.request.agent(server)
	let user3 = chai.request.agent(server)

	//Wait for app to start before commencing
	before((done) => {
		if(server.locals.appStarted) done()
			
		server.on('appStarted', () => {
			done()
		})
	})

	describe('POST /', () => {
		before(async () => {
			try {
				let accounts = []

				accounts.push(
					admin
					.post('/api/v1/user')
					.set('content-type', 'application/json')
					.send({
						username: 'adminaccount',
						password: 'password',
						admin: true
					})
				)
				accounts.push(
					user1
					.post('/api/v1/user')
					.set('content-type', 'application/json')
					.send({
						username: 'useraccount1',
						password: 'password'
					})
				)
				accounts.push(
					user2
					.post('/api/v1/user')
					.set('content-type', 'application/json')
					.send({
						username: 'useraccount2',
						password: 'password'
					})
				)
				accounts.push(
					user3
					.post('/api/v1/user')
					.set('content-type', 'application/json')
					.send({
						username: 'useraccount3',
						password: 'password'
					})
				)

				await Promise.all(accounts)

				return true
			} catch (e) {
				return e
			}
		})

		describe('POST /poll', () => {
			it('should create a PollQuestion and PollAnswers', async () => {
				let res = await user1
					.post('/api/v1/poll')
					.set('content-type', 'application/json')
					.send({
						question: 'Question here',
						answers: ['answer 1', 'answer 2', 'answer 3']
					})

				res.should.be.json
				res.should.have.status(200)

				res.body.should.have.property('question', 'Question here')
				res.body.should.have.property('id', 1)

				let poll = await PollQuestion.findById(1, {
					include: [User, PollAnswer]
				})

				poll.should.have.property('question', 'Question here')

				poll.PollAnswers.should.have.property('length', 3)
				poll.PollAnswers.should.contain.something.with.property('answer', 'answer 1')
				poll.PollAnswers.should.contain.something.with.property('answer', 'answer 2')
				poll.PollAnswers.should.contain.something.with.property('answer', 'answer 3')
			})
			
			it('should return an error if answers is missing', done => {
				user1
					.post('/api/v1/poll')
					.set('content-type', 'application/json')
					.send({
						question: 'Question here'
					})
					.end((err, res) => {
						res.should.have.status(400)
						res.body.errors.should.contain.something.with.property(
							'message',
							'You must provide at least 2 answers'
						)

						done()
					})
			})
			it('should return an error if answers is less than two', done => {
				user1
					.post('/api/v1/poll')
					.set('content-type', 'application/json')
					.send({
						question: 'Question here',
						answers: []
					})
					.end((err, res) => {
						res.should.have.status(400)
						res.body.errors.should.contain.something.with.property(
							'message',
							'You must provide at least 2 answers'
						)

						done()
					})
			})
			it('should return an error if answers contains duplicates', done => {
				user1
					.post('/api/v1/poll')
					.set('content-type', 'application/json')
					.send({
						question: 'Question here',
						answers: ['answer', 'answer 1', 'answer']
					})
					.end((err, res) => {
						res.should.have.status(400)
						res.body.errors.should.contain.something.with.property(
							'message',
							'Answers cannot contain any duplicates'
						)

						done()
					})
			})
			it('should return an error if question not provided', done => {
				user1
					.post('/api/v1/poll')
					.set('content-type', 'application/json')
					.send({
						answers: ['answer 1', 'answer 2']
					})
					.end((err, res) => {
						res.should.have.status(400)
						res.body.errors.should.contain.something.with.property(
							'message',
							'question cannot be null'
						)

						done()
					})
			})
			it('should return an error if not logged in', done => {
				chai.request(server)
					.post('/api/v1/poll')
					.set('content-type', 'application/json')
					.send({
						question: 'Question here',
						answers: ['answer', 'answer 2']
					})
					.end((err, res) => {
						res.should.have.status(401)
						res.body.errors.should.contain.something.which.deep.equals(Errors.requestNotAuthorized)

						done()
					})
			})
		})

		describe('POST /poll/:id', () => {
			let id, id2

			before(async () => {
				try {
					let res = await user1
						.post('/api/v1/poll')
						.set('content-type', 'application/json')
						.send({
							question: 'Poll question',
							answers: ['poll answer 1', 'poll answer 2', 'poll answer 3']
						})

					id = res.body.id

					let res2 = await user1
						.post('/api/v1/poll')
						.set('content-type', 'application/json')
						.send({
							question: 'Poll question',
							answers: ['poll answer 1', 'poll answer 2', 'poll answer 3']
						})

					id2 = res2.body.id

					return true
				} catch (e) {
					return e
				}
			})

			it('should add a vote to the poll', async () => {
				let res = await user1
					.post('/api/v1/poll/' + id)
					.set('content-type', 'application/json')
					.send({ answer: 'poll answer 1' })

				res.should.be.json
				res.should.have.status(200)

				let answer = await PollAnswer.findOne({
					where: {
						answer: 'poll answer 1'
					}
				})

				let vote = await PollVote.findById(res.body.id)
				vote.should.not.be.null
				vote.should.have.property('PollQuestionId', id)
				vote.should.have.property('PollAnswerId', answer.id)
			})
			it('should return an error if voting twice', done => {
				user1
					.post('/api/v1/poll/' + id)
					.set('content-type', 'application/json')
					.send({ answer: 'poll answer 2' })
					.end((err, res) => {
						res.should.have.status(400)
						res.body.errors.should.contain.something.that.has.property(
							'message',
							'you cannot vote twice'
						)

						done()
					})
			})
			it('should return an error if invalid id', done => {
				user1
					.post('/api/v1/poll/404')
					.set('content-type', 'application/json')
					.send({ answer: 'poll answer 1' })
					.end((err, res) => {
						res.should.have.status(400)
						res.body.errors.should.contain.something.that.has.property(
							'message',
							'invalid poll id'
						)

						done()
					})
			})
			it('should return an error if missing answer', done => {
				user1
					.post('/api/v1/poll/' + id2)
					.set('content-type', 'application/json')
					.send()
					.end((err, res) => {
						res.should.have.status(400)
						res.body.errors.should.contain.something.that.has.property(
							'message',
							'invalid answer'
						)

						done()
					})
			})
			it('should return an error if answer is invalid', done => {
				user1
					.post('/api/v1/poll/' + id2)
					.set('content-type', 'application/json')
					.send({ answer: 'not an option' })
					.end((err, res) => {
						res.should.have.status(400)
						res.body.errors.should.contain.something.that.has.property(
							'message',
							'invalid answer'
						)

						done()
					})
			})
			it('should return an error if not logged in', done => {
				chai.request(server)
					.post('/api/v1/poll/' + id)
					.set('content-type', 'application/json')
					.send({ answer: 'poll answer 1' })
					.end((err, res) => {
						res.should.have.status(401)
						res.body.errors.should.contain.something.which.deep.equals(Errors.requestNotAuthorized)
					})

					done()
			})
		})
	})

	after(() => sequelize.sync({ force: true }))
})