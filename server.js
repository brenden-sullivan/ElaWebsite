var express = require('express');
var app = express();
var template = require('jade');
var http = require('http').Server(app);
var fs = require('fs');
var rimraf = require('rimraf');

//sqlite3
var sqlite3 = require('sqlite3').verbose();
var dataPath = process.env.OPENSHIFT_DATA_DIR || 'data/'; //also used for files
var dbpath = dataPath + 'database.db';
var db = new sqlite3.Database(dbpath);
var dbsetup = require("./dbsetup.js");
//creates database
dbsetup.setup(db);
dbsetup.testLoad(db);

//support parsing post request bodies
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var multer = require('multer');
var storage = multer.diskStorage({
	destination: function (req, file, cb) {
		var cookies = cookie.parse(req.headers.cookie || '');
		try {
			fs.statSync(dataPath + "uploads/")
		} catch(e) {
			fs.mkdirSync(dataPath + "uploads/");
		}
		try {
			fs.statSync(dataPath + "uploads/" + cookies.id)
		} catch(e) {
			fs.mkdirSync(dataPath + "uploads/" + cookies.id);
		}
		
		cb(null, dataPath + 'uploads/' + cookies.id)
	},
	filename: function (req, file, cb) {
		var cookies = cookie.parse(req.headers.cookie || '');
		cb(null, file.originalname)
	}
});
var upload = multer({storage: storage});

//support cookies
var cookie = require('cookie');

//sanitize and validate inputs
var validator = require('validator');

//define static directory
app.use('/static', express.static(__dirname + '/static'));
app.use(express.static(dataPath));

//home
app.get('/', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');

	//if username or permission not set, have them log in again
	if(!cookies.name || !cookies.permission) {
		try {
			var data = {
				titleString: 'Log In', 
				statusString: ''
			};
			
			var html = template.renderFile(__dirname + '/static/loginpage.jade', data);
				
			res.send(html);
		} catch (e) {
			 next(e);
		}
	}
	
	else {
		var sql = "select Announcements.id, Announcements.date, Announcements.title, \
				    Announcements.content, People.first_name, People.last_name \
				   from Announcements join People on Announcements.poster = People.id \
				   order by Announcements.date desc \
				   limit 10;";
				   
		db.all(sql, function(err, rows) {
			if(err) {
				logErrors(err);
			}
			
			db.all("select id, first_name, last_name from people where permission = 'admin' and id != 1;", function(err, people) {
				if(err) {
					logErrors(err);
				}
				
				try {
					var data = {
						titleString: 'Home',
						
						view: cookies.view,
						greetingName: cookies.name,
						
						announcements: rows,
						posters: people
					}
					
					var html = template.renderFile(__dirname + "/static/index.jade", data);
					
					res.send(html);
			
				} catch(e) {
					 next(e);
				}
				
			});
		});
	}
});

/*********************************************************************
Log in, log out, and signup functions
**********************************************************************/
//login
app.post('/login', function(req, res, next) {

	var postBody = req.body;
	var name = postBody.username;
	var pass = postBody.password;
	var hashPass = require('crypto').createHash('md5').update(pass).digest('hex');

	var stmt = db.prepare("select * from People where username=?")
	
	stmt.all([name], function(err, rows) {
		
		//errors
		//username not in db
		if(rows.length == 0) {
			try {
				var errorString = "Unknown username, try again or sign up";
				var data = {
					titleString: 'Log In', 
					statusString: errorString
				};
				
				var html = template.renderFile(__dirname + '/static/loginpage.jade', data);
					
				res.send(html);
			} catch (e) {
				 next(e);
			}
		}
		
		//incorrect password
		else if(hashPass != rows[0].password) {
			try {
				var errorString = "Incorrect password. Please try again.";
				var data = {
					titleString: 'Log In', 
					statusString: errorString
				};
				
				var html = template.renderFile(__dirname + '/static/loginpage.jade', data);
					
				res.send(html);
			} catch (e) {
				 next(e);
			}
		}
		
				
		//db error
		else if(err) {
			try {
				var errorString = "There was an error on the server, please try again";
				var data = {
					titleString: 'Log In', 
					statusString: errorString
				};
				
				var html = template.renderFile(__dirname + '/static/loginpage.jade', data);
					
				res.send(html);
			} catch (e) {
				logErrors(err);
				 next(e);
			}
		}
		
		//success
		//if password correct, send to re-direct, then home page
		else if(hashPass == rows[0].password) {
			
			try {
				var data = {
					titleString: 'Re-direct'
				}
			
				var html = template.renderFile(__dirname + '/static/redirect.jade', data);
				
				
				res.setHeader('Set-Cookie', 
					[
					cookie.serialize('id', rows[0].id, {
						maxAge: 60 * 60 * 24 * 7 //a week
					}), 
					cookie.serialize('name', rows[0].first_name, {
						maxAge: 60 * 60 * 24 * 7 //a week
					}), 
					cookie.serialize('permission', rows[0].permission, {
						maxAge: 60 * 60 * 24 * 7 * 52 //a year
					}), 
					cookie.serialize('view', rows[0].permission, {
						maxAge: 60 * 60 * 24 * 7 * 52 //a year
					})
					]
				);
				
				res.send(html);
				
			} catch(e) {
				 next(e);
			}
		}
	});
	
	stmt.finalize();

});

//signup form
//note - using post here only to prevent "?" at end of url which is default on get from form submit
app.post('/signup-form', function(req, res, next) {
	db.all("select id, last_name from People where permission = 'admin' and id != 1;", function(err, rows) {
		console.log(rows);
		
		try {
			var data = {
				titleString: 'Sign Up',
				teachers: rows
			};
		
			var html = template.renderFile(__dirname + '/static/signup-form.jade', data);
				
			res.send(html);
			
		} catch(e) {
			 next(e);
		}
	});

});

//signup form submit - handle posted form
app.post('/signup', function(req, res, next) {

	var formData = req.body;
	//formData = sanitizeForm(formData);
	//console.log(formData);
	
	//check that form is correct - all required fields filled and passwords match
	//var statuses = {};
	var statuses = checkSignupForm(formData);
	
	var username = formData['username-form'];
	var password = formData['password-form'];
	var first = formData['first-name'];
	var last = formData['last-name'];
	var teacher = formData['teacher'];
	var hour = formData['hour'];
	var email = formData['email-input'];
	var access = formData['access-code-input'];
	
	//check that access code is correct
	db.all("select * from AdminConfig", function(err, rows) {
		if(err) {
			logErrors(err);
		}
		
		else if((access != rows[0].student_key) 
			&& (access != rows[0].admin_key)) {
			
			statuses['accessCodeStatus'] = "Invalid access code";
			statuses['modified'] = true;
		}
		
		var studentKey = rows[0].student_key;
		var adminKey = rows[0].admin_key;
		var status = statuses;
		
		//check that username is not taken
		db.all("select * from People where username=?", [username], function(err, rows) {
			//console.log(rows);
			
			//error handle
			if(err) {
				logErrors(err);
			}
			
			//if username taken (i.e. there is  a row with that username)
			else if(rows.length > 0) {
				statuses['accountStatus'] = "Username taken, please choose another one.";
				statuses['modified'] = true;
			}
			
			////////////////////////////////////////////////////////////
			//send responses (success or re-try)
			
			//send form to be re-filled out
			if(statuses['modified']) {
				console.log("Failure");
				
				try {
					var data = {
						titleString: 'Sign Up',
						
						usernameValue: username,
						firstValue: first,
						lastValue: last,
						emailValue: email,
						accessCodeValue: access,
						 
						accountStatus: statuses['accountStatus'],
						nameStatus: statuses['nameStatus'],
						accessCodeStatus: statuses['accessCodeStatus'],
						formStatus: statuses['formStatus']
					};
					
					var html = template.renderFile(__dirname + '/static/signup-form.jade', data);
					
					res.send(html);
				
				} catch(e) {
					 next(e);
				}
			}
		
		
			else {
				
				//get permission associated with key provided
				var permission;
				
				if(access == studentKey) {
					permission = "student";
				}
				
				else if(access == adminKey) {
					permission = "admin";
				}
				
				//insert all info into People
				var hashPass = require('crypto').createHash('md5').update(password).digest('hex');
				var stmt = db.prepare("insert into People(username, password, first_name, last_name, hour, teacher, email, permission)" +
					"values (?,?,?,?,?,?,?,?);");
				
				stmt.all([username, hashPass, first, last, hour, teacher, email, permission], function(err, rows) { 
					if(err) { logErrors(err); }
					db.all("select id from People where username = ?", [username], function(err, rows) {
					//redirect to home page
					try {
						var data = {
							titleString: 'Re-direct'
						};
						
						var html = template.renderFile(__dirname + '/static/redirect.jade', data);
							
						res.setHeader('Set-Cookie', 
							[
							cookie.serialize('id' , rows[0].id, {
								maxAge: 60 * 60 * 24 * 7 //a week
							}),
							cookie.serialize('name' , first, {
								maxAge: 60 * 60 * 24 * 7 //a week
							}), 
							cookie.serialize('permission', permission, {
								maxAge: 60 * 60 * 24 * 7 * 52 //a year
							}),
							cookie.serialize('view', permission, {
							maxAge: 60 * 60 * 24 * 7 * 52 //a year
							})
							]
						);
						
						res.send(html);
						
					} catch (e) {
						 next(e)
					}
					});
				});
			}
		}); //end username db call
	}); //end permission db call	
});

//guest
app.get('/guest', function(req, res, next) {
	try {
		var data = {
			titleString: 'Re-direct'
		};
	
		var html = template.renderFile(__dirname + '/static/redirect.jade', data);
			
		res.setHeader('Set-Cookie', 
			[
			cookie.serialize('id', -1, {
				maxAge: 60 * 60 * 24 * 7 //a week
			}), 
			cookie.serialize('name', 'Guest', {
				maxAge: 60 * 60 * 24 * 7 //a week
			}), 
			cookie.serialize('permission', 'guest', {
				maxAge: 60 * 60 * 24 * 7 * 52 //a year
			}),
			cookie.serialize('view', 'guest', {
				maxAge: 60 * 60 * 24 * 7 * 52 //a year
			})
			]
		);
		
		res.send(html);
			
	} catch (e) {
		 next(e)
	}
});

//handle password change
app.post('/change-password', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	var user = cookies.id;
	
	var formData = req.body;
	
	var originalPass = formData['orig-pass'];
	var newPass = formData['new-pass'];
	var confirm = formData['confirm-pass'];
	
	//check that password and confirmation password are the same
	//send page with error if not
	if(newPass != confirm) {
		try {
			var data = {
				titleString: 'Account',
				view: cookies.permission,
				greetingName: cookies.name,
			
				changePassStatus: "New password did not match confirm password, please re-enter"
			}
			
			var html = template.renderFile(__dirname + '/static/account.jade', data);

			res.send(html);
		
		} catch(e) {
			 next(e);
		}
	}

	else {
		db.all("select * from People where id = ?", [user], function(err, rows) {
		
			var hashPass = require('crypto').createHash('md5').update(originalPass).digest('hex');
			var hashNewPass = require('crypto').createHash('md5').update(newPass).digest('hex');
			//if password doesn't match current password resend page with error
			if(rows[0].password != hashPass) {
				try {
					var data = {
						titleString: 'Account',
						view: cookies.permission,
						greetingName: cookies.name,
					
						changePassStatus: "Invalid password"
					}
				
					var html = template.renderFile(__dirname + '/static/account.jade', data);

					res.send(html);
		
				} catch(e) {
					 next(e);
				}
			}
			
			//passwords math and new pass is confirmed, so change db
			else {
				//modify password in db
				db.run("update People set password = ? where id = ?", [hashNewPass, user], function(err) {
					if(err) { logErrors(err); }
				});
				
				//re-direct to account page with status success
				try {
					var data = {
						titleString: 'Account',
						view: cookies.permission,
						greetingName: cookies.name,
					
						changePassStatus: "Successfully changed password"
					}
				
					var html = template.renderFile(__dirname + '/static/account.jade', data);

					res.send(html);
		
				} catch(e) {
					 next(e);
				}
			}
		});
	}
});


//handle log out (basically just remmoves all the cookies
app.get('/logout', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');

	try {
		var data = {
			titleString: 'Re-direct'
		};
	
		var html = template.renderFile(__dirname + '/static/redirect.jade', data);
			
		//set all cookiesto expire
		res.setHeader('Set-Cookie', 
			[
			cookie.serialize('id', 'Guest', {
				maxAge: -1000
			}), 
			cookie.serialize('name', 'Guest', {
				maxAge: -1000
			}), 
			cookie.serialize('permission', 'guest', {
				maxAge: -1000
			}),
			cookie.serialize('view', 'guest', {
				maxAge: -1000
			})
			]
		);
		
		//redirect to log-in
		res.send(html);
			
	} catch (e) {
		 next(e)
	}

});


/****************************************************************************
Handling page content calls (create, read, update, delete)
****************************************************************************/

//get user's profile
app.get('/Account', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	var id = cookies.id;
	
	res.redirect('/Account/' + id);

});

app.get('/Account/*', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	
	try {
		var data = {
			titleString: 'Account',
			view: cookies.permission,
			greetingName: cookies.name
			
		}
		
		var html = template.renderFile(__dirname + '/static/account.jade', data);

		res.send(html);
	} catch(e) {
		 next(e);
	}
});

//Filtered announcements
app.get("/Announcements/*", function(req, res, next) {
	var id = req.params[0];
	var cookies = cookie.parse(req.headers.cookie || '');
	
	//case where we want all announcements
	if(id == "all") {
		
		var sql = "select Announcements.id, Announcements.date, Announcements.title, \
				   Announcements.content, People.first_name, People.last_name \
				   from Announcements join People on Announcements.poster = People.id \
				   order by Announcements.date desc \
				   limit 10;";
		/*		   
		var sql = "select Announcements.id, Announcements.date, Announcements.title, \
				   Announcements.content, People.first_name, People.last_name \
				   from Announcements join People on Announcements.poster = People.id \
				   order by Announcements.date desc \
				   limit 10;";
		*/
		
		db.all(sql, function(err, rows) {
			if(err) {
				logErrors(err);
			}
				
			try {
				var data = {
					titleString: 'Home',
					
					view: cookies.view,
					greetingName: cookies.name,
					
					announcements: rows
				}
				
				var html = template.renderFile(__dirname + "/static/announcements.jade", data);
				
				res.send(html);
		
			} catch(e) {
				 next(e);
			}
		});
	}
	
	//want one admins announcements
	else{
		var sql = "select Announcements.id, Announcements.date, Announcements.title, \
				   Announcements.content, People.first_name, People.last_name \
				   from Announcements join People on Announcements.poster = People.id \
				   where People.id = ? \
				   order by Announcements.date desc \
				   limit 10;";
				   
		db.all(sql, [id], function(err, rows) {
			if(err) {
				logErrors(err);
			}
				
			try {
				var data = {
					titleString: 'Home',
					
					view: cookies.view,
					greetingName: cookies.name,
					
					announcements: rows
				}
				
				var html = template.renderFile(__dirname + "/static/announcements.jade", data);
				
				res.send(html);
		
			} catch(e) {
				 next(e);
			}
		});
	}
});

//handle adding announcement
app.post('/add-announcement', function(req, res, next) { 
	var cookies = cookie.parse(req.headers.cookie || '');
	
	var formData = req.body;
	
	var title = formData['announcement-title'];
	var content = formData['announcement-content'];
	
	db.run("insert into Announcements(id, poster, date, title, content) \
		values(?, ?, datetime('now', 'localtime'), ?, ?);", 
		[null, cookies.id, title, content],
		
	function(err) {
			
			//null, cookies.id, select date('now'), title. content
		var status = {modified: false};	
		if(err) {
			logErrors(err);
			status['message'] = "Server error, please try again";
			
			//send old announcements
			var sql = "select Announcements.id, Announcements.date, Announcements.title, \
				   Announcements.content, People.first_name, People.last_name \
				   from Announcements join People on Announcements.poster = People.id \
				   order by Announcements.date desc \
				   limit 10;";
				   
			db.all(sql, function(err, rows) {
				if(err) {
					logErrors(err);
				}
				
				try {
					var data = {
						view: cookies.view,
						greetingName: cookies.name,
						
						announcementTitle: title, 
						announcementContent: content,
						
						announcements: rows,
						addAnnouncementStatus: "Error, please try again"
					}
					
					var html = template.renderFile(__dirname + "/static/announcements.jade", data);
					
					res.send(html);
			
				} catch(e) {
					 next(e);
				}
			});
		}
		
		else {
			//send updated announcements
			var sql = "select Announcements.id, Announcements.date, Announcements.title, \
				   Announcements.content, People.first_name, People.last_name \
				   from Announcements join People on Announcements.poster = People.id \
				   order by Announcements.date desc \
				   limit 10;";
				   
			db.all(sql, function(err, rows) {
				if(err) {
					logErrors(err);
				}
				
				try {
					var data = {
						view: cookies.view,
						greetingName: cookies.name,
						
						announcements: rows,
						addAnnoucementStatus: "Successfully added link"
					}
					
					var html = template.renderFile(__dirname + "/static/announcements.jade", data);
					
					res.send(html);
			
				} catch(e) {
					 next(e);
				}
			});
		
		}
			
	});

});

//delete Announcement
app.delete('/delete-announcements/*', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');

	var announcementId = req.params[0];
	
	//only actually delete if this is a call from an admin
	if(cookies.permission == 'admin') {
		db.run("delete from Announcements where id=?", [announcementId], function(err) {
			if(err) {
				logErrors(err);
			}
			
			//no errors = send updated page
			else {
				db.all("select * from Announcements order by date desc limit 10", function(err, rows) {
					if(err) {
						logErrors(err);
					}
					
					try {
						var data = {
							view: cookies.view,
							greetingName: cookies.name,
							titleString: "Home",
							
							announcements: rows
						}
						
						var html = template.renderFile(__dirname + "/static/announcements.jade", data);
						
						res.send(html);
				
					} catch(e) {
						 next(e);
					}
				});
			}
		
		});
	}
	
	//else just re-send page as is
	else {
		db.all("select * from Announcements order by date desc limit 10", function(err, rows) {
			if(err) {
				logErrors(err);
			}
			
			try {
				var data = {
					view: cookies.view,
					greetingName: cookies.name,
					titleString: "Home",
					
					announcements: rows
				}
				
				var html = template.renderFile(__dirname + "/static/announcements.jade", data);
				
				res.send(html);
		
			} catch(e) {
				 next(e);
			}
		});
	}
});

//get documents page
app.get('/Documents', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');

	var sql = "select Documents.id as id, Documents.date as date, Documents.assignment_name as assignment_name, \
			   Documents.link_path as link_path, \
			   Person.first as first_name, Person.last as last_name, Person.hour as hour, Person.teach as teacher \
			   from Documents join \
			   (select Student.id as id, Student.hour as hour, Student.first_name as first, Student.last_name as last, Teacher.last_name as teach \
			   from People as Student join People as Teacher on Student.teacher = Teacher.id) as Person \
			   on Documents.person = Person.id \
			   order by Documents.date desc;";
	
	db.all(sql, function(err, rows) { 
		if(err) {
			logErrors(err);
		}
		try {
			var data = {
				titleString: "Writing",
				view: cookies.view,
				greetingName: cookies.name,
				
				uploads: rows
			}
			
			var html = template.renderFile(__dirname + "/static/documents.jade", data);

			res.send(html);

		} catch(e) {
			 next(e);
		}
	});

});

//handle upload of document
//app.post('/documents-upload', upload.single('file'), function(req, res, next) {
app.post('/documents-upload', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	
	var formData = req.body;
	console.log(formData);
	//var file = req.file;
	//var link = "/uploads/" + cookies.id + "/" + file.originalname;
	var link = formData['url'];
	var assignment = formData['doc-assignment-name'];
	
	db.serialize(function() {
	//Documents(id, person, date, assignment_name, link_path)
	db.run("insert into Documents(id, person, date, assignment_name, link_path) values(?,?, datetime('now', 'localtime'),?,?)", 
		[null, cookies.id, assignment, link],
		function(err) {
			if(err) { logErrors(err); }
		}
	);
	
	var sql = "select Documents.id as id, Documents.date as date, Documents.assignment_name as assignment_name, \
			   Documents.link_path as link_path, \
			   Person.first as first_name, Person.last as last_name, Person.hour as hour, Person.teach as teacher \
			   from Documents join \
			   (select Student.id as id, Student.hour as hour, Student.first_name as first, Student.last_name as last, Teacher.last_name as teach \
			   from People as Student join People as Teacher on Student.teacher = Teacher.id) as Person \
			   on Documents.person = Person.id \
			   order by Documents.date desc;";
			   
	db.all(sql, function(err, rows) { 
		if(err) {
			logErrors(err);
		}
		try {
			var data = {
				titleString: "Writing",
				view: cookies.view,
				greetingName: cookies.name,
				
				uploads: rows
			}
			
			var html = template.renderFile(__dirname + "/static/uploads.jade", data);

			res.send(html);

		} catch(e) {
			 next(e);
		}
	});
	
	});// end serialize
	
});

//filter by names, assignment name
app.post('/Documents/filter', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	var formData = req.body;
	
	var sql = "select Documents.id as id, Documents.date as date, Documents.assignment_name as assignment_name, \
			   Documents.link_path as link_path, \
			   Person.first as first_name, Person.last as last_name, Person.hour as hour, Person.teach as teacher \
			   from Documents join \
			   (select Student.id as id, Student.hour as hour, Student.first_name as first, Student.last_name as last, Teacher.last_name as teach \
			   from People as Student join People as Teacher on Student.teacher = Teacher.id) as Person \
			   on Documents.person = Person.id"
	
	var args = []; //holds argument to pass to db.all(sql, args, function)
	
	var length = 0; //# of non-empty args
	for(var value in formData) {
		if(formData.hasOwnProperty(value)) {
			if(formData[value] != '') {
				length += 1;
			}
		}
	}
	
	//if search has any parameters we add where clause, otherwise just resend all books
	if(length > 0) {
		sql = sql + " where "
	
		for(var value in formData) {
			if(formData.hasOwnProperty(value)) {
				if(formData[value] != '') {
					if(value == 'first-name') {
						sql = sql + "Person.first like ?";
						args.push("%" + formData['first-name'] + "%");
					}
					
					else if(value == 'last-name') {
						sql = sql + "Person.last like ?";
						args.push("%" + formData['last-name'] + "%");
					}
					
					else if(value == 'assignment-name') {
						sql = sql + "Documents.assignment_name like ?";
						args.push("%" + formData['assignment-name'] + "%");
					}
					
					else if(value == 'teacher') {
						sql = sql + "Person.teach like ?";
						args.push("%" + formData['teacher'] + "%");
					}
					
					else if(value == 'hour') {
						sql = sql + "Person.hour = ?";
						args.push(formData['hour']);
					}
					
					//add in "and" between where clause statements
					if(length > 1) {
						sql = sql + " and ";
						length--;
					}
				}
			}
		}
	}
	
	sql = sql + " order by Documents.date desc;";
	
	var stmt = db.prepare(sql);
	
	stmt.all(args, function(err, rows) { 
		if(err) {
			logErrors(err);
		}
		try {
			var data = {
				titleString: "Writing",
				view: cookies.view,
				greetingName: cookies.name,
				
				uploads: rows
			}
			
			var html = template.renderFile(__dirname + "/static/uploads.jade", data);

			res.send(html);

		} catch(e) {
			 next(e);
		}
	});
});

//admin documents delete
app.delete('/Documents/*', function(req, res, next) {
	var linkId = req.params[0];
	var cookies = cookie.parse(req.headers.cookie || '');
	
	if(cookies.permission == 'admin') {
		db.serialize(function() {
		
		//delete file from file system
		db.all("select * from Documents where id=?", [linkId], function(err, rows) {
			if(err) {
				logErrors(err);
			}
			
			else {
				try {
					fs.unlinkSync("./" + rows[0].path);
				} catch(e) {
					logErrors(e);
				}
			}
		
		});
		
		//delete reference to file in db
		db.run("delete from Documents where id=?", [linkId], function(err) {
			if(err) {
				logErrors(err);
			}
			
			//no errors = send updated page
			else {
				var sql = "select Documents.id as id, Documents.date as date, Documents.assignment_name as assignment_name, \
				   Documents.link_path as link_path, \
				   Person.first as first_name, Person.last as last_name, Person.hour as hour, Person.teach as teacher \
				   from Documents join \
				   (select Student.id as id, Student.hour as hour, Student.first_name as first, Student.last_name as last, Teacher.last_name as teach \
				   from People as Student join People as Teacher on Student.teacher = Teacher.id) as Person \
				   on Documents.person = Person.id \
				   order by Documents.date desc;";
				   
				db.all(sql, function(err, rows) { 
					if(err) {
						logErrors(err);
					}
					try {
						var data = {
							titleString: "Writing",
							view: cookies.view,
							greetingName: cookies.name,
							
							uploads: rows
						}
						
						var html = template.renderFile(__dirname + "/static/uploads.jade", data);

						res.send(html);

					} catch(e) {
						 next(e);
					}
				});
			}
		
		});
		
		}); // end serialize
	}
	
	else {
		var sql = "select Documents.id as id, Documents.date as date, Documents.assignment_name as assignment_name, \
			   Documents.link_path as link_path, \
			   Person.first as first_name, Person.last as last_name, Person.hour as hour, Person.teach as teacher \
			   from Documents join \
			   (select Student.id as id, Student.hour as hour, Student.first_name as first, Student.last_name as last, Teacher.last_name as teach \
			   from People as Student join People as Teacher on Student.teacher = Teacher.id) as Person \
			   on Documents.person = Person.id \
			   order by Documents.date desc;";
		   
		db.all(sql, function(err, rows) { 
			if(err) {
				logErrors(err);
			}
			try {
				var data = {
					titleString: "Writing",
					view: cookies.view,
					greetingName: cookies.name,
					
					uploads: rows
				}
				
				var html = template.renderFile(__dirname + "/static/uploads.jade", data);

				res.send(html);

			} catch(e) {
				next(e);
			}
		});
	}
});

//get books - first page is books with their scores and info
app.get('/Books', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	
	var sql = "select Books.id, Books.title, Books.author_first, Books.author_last, Books.genre, \
			   round(avg(Reviews.score), 2) as average \
			   from Books join Reviews on Books.id = Reviews.book \
			   group by Books.title \
			   order by average desc;"
			   
	db.all(sql, function(err, rows) {
		if(err) { logErrors(err) }
		
		try {
			var data = {
				titleString: "Books",
				view: cookies.view,
				greetingName: cookies.name,
				
				books: rows
			}
			
			var html = template.renderFile(__dirname + "/static/book-reviews.jade", data);
			
			res.send(html);
			
		} catch(e) {
			next(e)
		}
	
	});
});

//filter book results
app.post('/Books/filter', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	var formData = req.body;

	var sql = "select Books.id, Books.title, Books.author_first, Books.author_last, Books.genre, \
		   round(avg(Reviews.score), 2) as average \
		   from Books join Reviews on Books.id = Reviews.book";
		   
	var args = []; //holds argument to pass to db.all(sql, args, function)
	
	var length = 0; //# of non-empty args
	for(var value in formData) {
		if(formData.hasOwnProperty(value)) {
			if(formData[value] != '') {
				length += 1;
			}
		}
	}
	
	//if search has any parameters we add where clause, otherwise just resend all books
	if(length > 0) {
		sql = sql + " where "
	
		for(var value in formData) {
			if(formData.hasOwnProperty(value)) {
				if(formData[value] != '') {
					if(value == 'book-title') {
						sql = sql + "Books.title like ?";
						args.push("%" + formdata['book-title'] + "%");
					}
					
					else if(value == 'first-name') {
						sql = sql + "Books.author_first like ?";
						args.push("%" + formData['first-name'] + "%");
					}
					
					else if(value == 'last-name') {
						sql = sql + "Books.author_last like ?";
						args.push("%" + formData['last-name'] + "%");
					}
					
					else if(value == 'genre') {
						sql = sql + "Books.genre like ?";
						args.push("%" + formData['genre'] + "%");
					}
					
					else if(value == 'review-score') {
						sql = sql + "Reviews.score = ?";
						args.push(formData['review-score']);
					}
					
					//add in "and" between where clause statements
					if(length > 1) {
						sql = sql + " and ";
						length--;
					}
				}
			}
		}
	}
		   
	sql = sql + " group by Books.title order by average desc;";
	
	var stmt = db.prepare(sql);
	
	stmt.all(args, function(err, rows) {
	
		if(err) { logErrors(err) }
		
		try {
			var data = {
				titleString: "Books",
				view: cookies.view,
				greetingName: cookies.name,
				
				books: rows
			}
			
			var html = template.renderFile(__dirname + "/static/books.jade", data);
			
			res.send(html);
			
		} catch(e) {
			 next(e)
		}
	
	});
});

//add book review
app.post('/add-review', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	var formData = req.body;
	
	var title = formData['book-title'];
	title = validator.escape(title);
	title = titleCase(title);
	var authorFirst = formData['author-first'];
	authorFirst = validator.escape(authorFirst);
	var authorLast = formData['author-last'];
	authorLast = validator.escape(authorLast);
	var genre = formData['book-genre'];
	genre = validator.escape(genre);
	var pages = formData['book-pages'];
	pages = validator.escape(pages);
	
	var score = formData['review-score'];
	var content = formData['review-content'];
	
	var reviewer = cookies.id;
	
	
	db.serialize(function() {
	var status = '';
	//insert book and review
	db.all("select * from Books where title = ?", function(err, rows) {
		if(err) { logErrors(err) }
		
		//book doesn't exist
		if(rows.length == 0) {
			db.serialize(function() {
				//insert as new book
				var bookstmt = db.prepare("insert into Books(id, title, author_first, author_last, pages, genre) values(?,?,?,?,?,?)");
				bookstmt.run([null, title, authorFirst, authorLast, pages, genre],
					function(err) { 
						if(err) { logErrors(err); }
					}
				);
				
				//get book id
				db.all("select * from Books where title = ?", [title], function(err, rows) {
					var bookID = rows[0].id;
					
					//insert review
					var revstmt = db.prepare("insert into Reviews(id, writer, book, score, date, text) \
						values(?,?,?,?,datetime('now', 'localtime'), ?)");
						
					revstmt.run([null, reviewer, bookID, score, content],
						function(err) { 
							if(err) { logErrors(err); }
						}
					);
				});
				
				var sql = "select Books.id, Books.title, Books.author_first, Books.author_last, Books.genre, \
				round(avg(Reviews.score), 2) as average \
				from Books join Reviews on Books.id = Reviews.book \
				group by Books.title \
				order by average asc;"
				   
				db.all(sql, function(err, rows) {
					if(err) { logErrors(err); }
					status = "Success";
					try {
						var data = {
							titleString: "Books",
							view: cookies.view,
							greetingName: cookies.name,
							
							books: rows,
							addReviewStatus: status
						}
						
						var html = template.renderFile(__dirname + "/static/books.jade", data);
						
						res.send(html);
						
					} catch(e) {
						 next(e)
					}
				
				});
				
			
			}); //end db.serialize	
		}
		
		//if book already exists, just insert review
		else {
			//get book id
			db.all("select * from Books where title = ?", [title], function(err, rows) {
					var bookID = rows[0].id;
					
					//insert review
					var revstmt = db.prepare("insert into Reviews(id, writer, book, score, date, text) \
						values(?,?,?,?,datetime('now', 'localtime'), ?)");
						
					revstmt.run([null, reviewer, bookID, score, content],
						function(err) { 
							if(err) { logErrors(err); }
						}
					);
			});
			
			//send page data
			var sql = "select Books.id, Books.title, Books.author_first, Books.author_last, Books.genre, \
			round(avg(Reviews.score), 2) as average \
			from Books join Reviews on Books.id = Reviews.book \
			group by Books.title \
			order by average asc;"
			   
			db.all(sql, function(err, rows) {
				if(err) { logErrors(err); }
				status = "Success";
				try {
					var data = {
						titleString: "Books",
						view: cookies.view,
						greetingName: cookies.name,
						
						books: rows,
						addReviewStatus: status
					}
					
					var html = template.renderFile(__dirname + "/static/books.jade", data);
					
					res.send(html);
					
				} catch(e) {
					 next(e)
				}
			
			});
		}
	});
	
	}); //end outer db.serialize
});

//add book review from review page (i.e. book already exists, and we have info on it)
app.post('/add-review-existing', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	var formData = req.body;

	var title = formData['book-title'];
	title = titleCase(title);
	var score = formData['review-score'];
	var content = formData['review-content'];
	var reviewer = cookies.id;
	
	//get book id
	db.all("select * from Books where title = ?", [title], function(err, rows) {
		var bookID = rows[0].id;
		
		db.serialize(function() {
		//insert review
		var stmt = db.prepare("insert into Reviews(id, writer, book, score, date, text) \
			values(?,?,?,?,datetime('now', 'localtime'), ?)");
		
		stmt.run([null, reviewer, bookID, score, content],
			function(err) { 
				if(err) { logErrors(err); }
			}
		);
		
		var sql = "select People.first_name as r_first, People.last_name as r_last, \
			   Reviews.id as rid, Reviews.score as score, Reviews.date as date, \
			   Books.title as title, Books.author_first as a_first, \
			   Books.author_last as a_last, Books.pages as pages, Books.genre as genre \
			   from People join (Reviews join Books on Reviews.book = Books.id) \
			   on People.id = Reviews.writer \
			   where Reviews.book = ? \
			   order by Reviews.date desc";
			   
		db.all(sql, [bookID], function(err, rows) {
			if(err) { logErrors(err); }
			
			var data = {
				titleString: rows[0].title,
				bookTitle: rows[0].title,
				view: cookies.view,
				greetingName: cookies.name,
				
				reviews: rows
			}
		
			var html = template.renderFile(__dirname + "/static/reviews.jade", data);
			
			res.send(html);
		});
		
		}); //end db.serialize
	});
	
});

//get reviews for a particular book
app.get('/Books/*', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	var bookId = req.params[0];
	
	var sql = "select People.first_name as p_first, People.last_name as p_last, \
			   Reviews.id as rid, Reviews.score as score, Reviews.date as date, \
			   Books.title as title, Books.author_first as a_first, \
			   Books.author_last as a_last, Books.pages as pages, Books.genre as genre \
			   from People join (Reviews join Books on Reviews.book = Books.id) \
			   on People.id = Reviews.writer \
			   where Reviews.book = ? \
			   order by Reviews.date desc";
			   
	db.all(sql, [bookId], function(err, rows) {
		if(err) { logErrors(err); }
		
		try {
			var data = {
				titleString: rows[0].title,
				bookTitle: rows[0].title,
				view: cookies.view,
				greetingName: cookies.name,
				
				reviews: rows,
				author: rows[0].a_first + " " + rows[0].a_last,
				pages: rows[0].pages,
				genre: rows[0].genre,
			}
		
			var html = template.renderFile(__dirname + "/static/bookinfo.jade", data);
			
			res.send(html);
		} catch(e) {
			next(e);
		}
	});

});

//get Reviews as list of all reviews for all books
app.get('/Reviews', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	
	var sql = "select Person.first as first, Person.last as last, Person.teacher as teacher, \
			   Person.hour as hour, \
			   Reviews.id as rid, Reviews.date as date, \
			   Books.title as title, Books.id as bid \
			   from (select Student.id as pid, Student.first_name as first, Student.last_name as last, \
			   Student.hour as hour, Teacher.last_name as teacher \
			   from People as Student join People as Teacher on Student.teacher = Teacher.id) as Person \
			   join (Reviews join Books on Reviews.book = Books.id) \
			   on Person.pid = Reviews.writer \
			   order by Reviews.date desc";
			   
	db.all(sql, function(err, rows) {
		if(err) { logErrors(err); }
		
		try {
			var data = {
				titleString: "Reviews",
				view: cookies.view,
				greetingName: cookies.name,
				
				reviews: rows
			}
		
			var html = template.renderFile(__dirname + "/static/listreviews.jade", data);
			
			res.send(html);
		} catch(e) {
			next(e);
		}
	});

});

//filter out reviews
app.post('/reviews-filter', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	var formData = req.body;

	var sql = "select Person.first as first, Person.last as last, Person.teacher as teacher, \
			   Person.hour as hour, \
			   Reviews.id as rid, Reviews.date as date, \
			   Books.title as title, Books.id as bid \
			   from (select Student.id as pid, Student.first_name as first, Student.last_name as last, \
			   Student.hour as hour, Teacher.last_name as teacher \
			   from People as Student join People as Teacher on Student.teacher = Teacher.id) as Person \
			   join (Reviews join Books on Reviews.book = Books.id) \
			   on Person.pid = Reviews.writer";
		   
	var args = []; //holds argument to pass to db.all(sql, args, function)
	
	var length = 0; //# of non-empty args
	for(var value in formData) {
		if(formData.hasOwnProperty(value)) {
			if(formData[value] != '') {
				length += 1;
			}
		}
	}
	
	//if search has any parameters we add where clause, otherwise just resend all books
	if(length > 0) {
		sql = sql + " where "
	
		for(var value in formData) {
			if(formData.hasOwnProperty(value)) {
				if(formData[value] != '') {
					if(value == 'book-title') {
						sql = sql + "Books.title like ?";
						args.push("%" + formData['book-title'] + "%");
					}
					
					else if(value == 'first-name') {
						sql = sql + "Person.first like ?";
						args.push("%" + formData['first-name'] + "%");
					}
					
					else if(value == 'last-name') {
						sql = sql + "Person.last like ?";
						args.push("%" + formData['last-name'] + "%");
					}
					
					else if(value == 'teacher') {
						sql = sql + "Person.teacher like ?";
						args.push("%" + formData['teacher'] + "%");
					}
					
					else if(value == 'hour') {
						sql = sql + "Person.hour = ?";
						args.push(formData['hour']);
					}
					
					//add in "and" between where clause statements
					if(length > 1) {
						sql = sql + " and ";
						length--;
					}
				}
			}
		}
	}
		   
	sql = sql + " order by Reviews.date desc;";
	
	var stmt = db.prepare(sql);
	
	stmt.all(args, function(err, rows) {
	
		if(err) { logErrors(err) }
		
		try {
			var data = {
				titleString: "Reviews",
				view: cookies.view,
				greetingName: cookies.name,
				
				reviews: rows
			}
			
			var html = template.renderFile(__dirname + "/static/reviewslist.jade", data);
			
			res.send(html);
			
		} catch(e) {
			 next(e)
		}
	
	});

});

//get a particular review (linked from book page)
app.get('/Reviews/*', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	var reviewId = req.params[0];
	
	var sql = "select * from Books join Reviews on Books.id = Reviews.book where Reviews.id = ?";

	db.all(sql, [reviewId], function(err, rows) {
		db.all("select * from People where id = ?", [rows[0].writer], function(err, prows) {
			
			try {
				var data = {
					titleString: "Review",
					view: cookies.view,
					greetingName: cookies.name,
					
					title: rows[0].title,
					reviewer: prows[0].first_name + " " + prows[0].last_name,
					author: rows[0].author_first + " " + rows[0].author_last,
					genre: rows[0].genre,
					pages: rows[0].pages,
					score: rows[0].score,
					date: rows[0].date,
					review: rows[0].text
				}
				
				var html = template.renderFile(__dirname + "/static/review.jade", data); 
			
				res.send(html);
			} catch(e) {
				next(e);
			}
		});
	});
});

//get course links list
app.get('/CourseLinks', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	
	db.all("select * from CourseLinks order by name", function(err, rows) {
		if(err) {
			logErrors(err);
		}
		else if (rows) {
			try {
				var data = {
					titleString: "Course Links",
					links: rows,
					view: cookies.view,
					greetingName: cookies.name,
				}
				
				var html = template.renderFile(__dirname + "/static/courselinks.jade", data);

				res.send(html);
			
			} catch(e) {
				 next(e);
			}
		}
	});

});

//handle admin link submission
app.post('/addlink-form', function(req, res, next) {
	var formData = req.body;
	
	var cookies = cookie.parse(req.headers.cookie || '');
	
	var status = checkAddLinkForm(formData); //used to display error messages back on page
	
	//form data fields
	var name = formData['link-name'];
	var url = formData['link-url'];
	var desc = formData['link-desc'];
	
	//if there was some error
	if(status['modified']) {
	
		db.all("select * from CourseLinks order by name", function(err, rows) {
			if(err) {
				status['addLinkStatus'] = "Server error, please try again";
				logErrors(err);
			}
			
			try {
				//console.log("status");
				//console.log(status);
				var data = {
					linkNameValue: name,
					linkURLValue: url,
					linkDescValue: desc,
					links: rows,
					addLinkStatus: status['addLinkStatus'], 
					
					view: cookies.view,
					greetingName: cookies.name
				}
				
				var html = template.renderFile(__dirname + "/static/links.jade", data);
				
				res.send(html);
		
			} catch(e) {
				 next(e);
			}
		});
	}
	
	//form was fine - try submit and if it doesn't work, reload with error message,
	//if it does work, reload with new link
	else {
		//try to insert new link
		db.run("insert into CourseLinks(name, link, description) values(?,?,?)", [name, url, desc], function(err) {
			if(err) {
				logErrors(err);
				
				if(err.errno == 19) {
					status['addLinkStatus'] = "Name already used, please enter a unique name";
					status['modified'] = true;
				}
				
				else {
					status['addLinkStatus'] = "Server error, please try again later";
					status['modified'] = true;
				}
				
				//resend old page
				db.all("select * from CourseLinks order by name", function(err, rows) {
					try {
				
						var data = {
							linkNameValue: name,
							linkURLValue: url,
							linkDescValue: desc,
							links: rows,
							addLinkStatus: status['addLinkStatus'], 
							
							view: cookies.view,
							greetingName: cookies.name
						}
						
						var html = template.renderFile(__dirname + "/static/links.jade", data);
						
						res.send(html);
				
					} catch(e) {
						 next(e);
					}
				});
			}
			
			//else send updated page
			else {
				db.all("select * from CourseLinks order by name", function(err, rows) {
					if(err) {
						logErrors(err);
					}
					
					try {
						var data = {
							view: cookies.view,
							greetingName: cookies.name,
							
							links: rows,
							addLinkStatus: "Successfully added link"
						}
						
						var html = template.renderFile(__dirname + "/static/links.jade", data);
						
						res.send(html);
				
					} catch(e) {
						 next(e);
					}
				});
			}
		});
	
	}
});

//handle admin deletion of link
app.delete('/CourseLinks/*', function(req, res, next) {
	var linkId = req.params[0];
	var cookies = cookie.parse(req.headers.cookie || '');
	
	if(cookies.permission == 'admin') {
		db.run("delete from CourseLinks where id=?", [linkId], function(err) {
			if(err) {
				logErrors(err);
			}
			
			//no errors = send updated page
			else {
				db.all("select * from CourseLinks order by name", function(err, rows) {
					if(err) {
						logErrors(err);
					}
					
					try {
						var data = {
							view: cookies.view,
							greetingName: cookies.name,
							
							links: rows
						}
						
						var html = template.renderFile(__dirname + "/static/links.jade", data);
						
						res.send(html);
				
					} catch(e) {
						 next(e);
					}
				});
			}
		
		});
	}
	
	else {
		db.all("select * from CourseLinks order by name", function(err, rows) {
			if(err) {
				logErrors(err);
			}
			
			try {
				var data = {
					view: cookies.view,
					greetingName: cookies.name,
					
					links: rows
				}
				
				var html = template.renderFile(__dirname + "/static/links.jade", data);
				
				res.send(html);
		
			} catch(e) {
				 next(e);
			}
		});
	}
});

//handle admin update of link
app.post('/UpdateLink/*', function(req, res, next) {
	var linkId = req.params[0];
	var cookies = cookie.parse(req.headers.cookie || '');
	var formData = req.body;
	
	var name = formData['name'];
	var url = formData['url'];
	var desc = formData['desc'];
	
	db.run("update CourseLinks set name=?, link=?, description=? where id=?", [name, url, desc, linkId], function(err) {
		if(err) {
			logErrors(err);
		}
		
		//no errors = send updated page
		else {
			db.all("select * from CourseLinks order by name", function(err, rows) {
				if(err) {
					logErrors(err);
				}
				
				try {
					var data = {
						view: cookies.view,
						greetingName: cookies.name,
						
						links: rows, 
						addLinkStatus: "Successfully updated link"
					}
					
					var html = template.renderFile(__dirname + "/static/links.jade", data);
					
					res.send(html);
			
				} catch(e) {
					 next(e);
				}
			});
		}
	
	});
});

/**********************************************************
* Admin tools
***********************************************************/
//handle admin key change
app.post('/change-admin-key', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	
	var formData = req.body;
	
	var originalKey = formData['orig-key'];
	var newKey = formData['new-key'];
	var confirm = formData['confirm-key'];
	
	//check that password and confirmation password are the same
	//send page with error if not
	if(newKey != confirm) {
		try {
			var data = {
				titleString: 'Account',
				view: cookies.permission,
				greetingName: cookies.name,
			
				changeAdminKeyStatus: "New key did not match confirm key, please re-enter"
			}
			
			var html = template.renderFile(__dirname + '/static/account.jade', data);

			res.send(html);
		
		} catch(e) {
			 next(e);
		}
	}

	else if(cookies.permission == "admin") {
		db.all("select * from AdminConfig", function(err, rows) {
		
			//if key doesn't match current key resend page with error
			if(rows[0].admin_key != originalKey) {
				try {
					var data = {
						titleString: 'Account',
						view: cookies.permission,
						greetingName: cookies.name,
					
						changeAdminKeyStatus: "Invalid key entered, please enter the correct admin key"
					}
				
					var html = template.renderFile(__dirname + '/static/account.jade', data);

					res.send(html);
		
				} catch(e) {
					 next(e);
				}
			}
			
			//keys match and new key is confirmed, so change db
			else {
				//modify password in db
				db.run("update AdminConfig set admin_key = ?", [newKey], function(err) {
					if(err) { logErrors(err); }
				});
				
				//re-direct to account page with status success
				try {
					var data = {
						titleString: 'Account',
						view: cookies.permission,
						greetingName: cookies.name,
					
						changeAdminKeyStatus: "Successfully changed admin key"
					}
				
					var html = template.renderFile(__dirname + '/static/account.jade', data);

					res.send(html);
		
				} catch(e) {
					 next(e);
				}
			}
		});
	}
});

//handle student key change
app.post('/change-student-key', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	
	var formData = req.body;
	
	var originalKey = formData['orig-key'];
	var newKey = formData['new-key'];
	var confirm = formData['confirm-key'];
	
	//check that password and confirmation password are the same
	//send page with error if not
	if(newKey != confirm) {
		try {
			var data = {
				titleString: 'Account',
				view: cookies.permission,
				greetingName: cookies.name,
			
				changeStudentKeyStatus: "New key did not match confirm key, please re-enter"
			}
			
			var html = template.renderFile(__dirname + '/static/account.jade', data);

			res.send(html);
		
		} catch(e) {
			 next(e);
		}
	}

	else if(cookies.permission == "admin") {
		db.all("select * from AdminConfig", function(err, rows) {
		
			//if key doesn't match current key resend page with error
			if(rows[0].student_key != originalKey) {
				try {
					var data = {
						titleString: 'Account',
						view: cookies.permission,
						greetingName: cookies.name,
					
						changeStudentKeyStatus: "Invalid key entered, please enter the correct student key"
					}
				
					var html = template.renderFile(__dirname + '/static/account.jade', data);

					res.send(html);
		
				} catch(e) {
					 next(e);
				}
			}
			
			//keys match and new key is confirmed, so change db
			else {
				//modify password in db
				db.run("update AdminConfig set student_key = ?", [newKey], function(err) {
					if(err) { logErrors(err); }
				});
				
				//re-direct to account page with status success
				try {
					var data = {
						titleString: 'Account',
						view: cookies.permission,
						greetingName: cookies.name,
					
						changeStudentKeyStatus: "Successfully changed student key"
					}
				
					var html = template.renderFile(__dirname + '/static/account.jade', data);

					res.send(html);
		
				} catch(e) {
					 next(e);
				}
			}
		});
	}
});

//rebuild database (drop tables, rebuild them, and add webmaster account and signup keys)
app.post('/database/rebuild', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	
	if(cookies.permission == 'admin') {
		dbsetup.rebuild(db, rimraf, dataPath);
	}
	
	res.redirect('/logout');
	

});

//directly submit sql to be run
app.post('/database/sql', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	var sql = req.body['sql-command'];
	
	//only do this if the request comes from admin
	if(cookies.permission == 'admin') {
		//attempt to run the sql provided
		db.run(sql, function(err) {
			//if err reload the page with status message of the error
			if(err) {
				logErrors(err);
				
				try {
					var data = {
						titleString: 'Account',
						view: cookies.permission,
						greetingName: cookies.name,
						
						sqlStatus: err
					}
					
					var html = template.renderFile(__dirname + '/static/account.jade', data);

					res.send(html);
				} catch(e) {
					 next(e);
				}
			}
			
			//else reload with status of success
			else {
				try {
					var data = {
						titleString: 'Account',
						view: cookies.permission,
						greetingName: cookies.name,
						
						sqlStatus: "Success"
					}
					
					var html = template.renderFile(__dirname + '/static/account.jade', data);

					res.send(html);
				} catch(e) {
					 next(e);
				}
			
			}
		});
	}
});

//clear student data to "start a new year"
app.post('/database/clear-students', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	
	//only do this if the request comes from admin
	if(cookies.permission == 'admin') {
		dbsetup.clearStudentData(db, fs);
		
		try {
			var data = {
				titleString: 'Account',
				view: cookies.permission,
				greetingName: cookies.name,
				
				clearStudentStatus: "Success"
			}
			
			var html = template.renderFile(__dirname + '/static/account.jade', data);

			res.send(html);
		} catch(e) {
			 next(e);
		}
	}

});

/**************************************************/
//start server
var server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080;
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';

http.listen(server_port, server_ip_address, function(){
  console.log("Listening on " + server_ip_address + ", server_port " + server_port);
});


/**************************************************/
//Helper methods

//checks for blank required fields and password fields match
//also checks that all inputs are only alpha-numeric
function checkSignupForm(data) { //, status) {
	
	var status = {modified: false};

	//if no username or password
	if(!data['username-form']&& !data['password-form']) {
		status['accountStatus'] = "Please enter a username and password";
		status['modified'] = true;
	}
	
	//no username
	else if(!data['username-form']) {
		status['accountStatus'] = "Please enter a username";
		status['modified'] = true;
	}
	
	//no password
	else if(!data['password-form']) {
		status['accountStatus'] = "Please enter a password";
		status['modified'] = true;
	}
	
	//mis-matching password and confirm password
	if(data['password-form'] !== data['password-confirm-form']) {
		status['accountStatus'] = "Passwords differ. Please re-enter password and confirm.";
		status['modified'] = true;
	}
	
	//no first name or last name
	if(!data['first-name'] && !data['last-name']) {
		status['nameStatus'] = "Please enter a first and last name";
		status['modified'] = true;
	}
	
	//no first name
	else if(!data['first-name']) {
		status['nameStatus'] = "Please enter a first name";
		status['modified'] = true;
	}
	
	//no last name
	else if(!data['last-name']) {
		status['nameStatus'] = "Please enter a last name";
		status['modified'] = true;
	}
	
	//no access code
	if(!data['access-code-input']) {
		status['accessCodeStatus'] = "Please enter an access code";
		status['modified'] = true;
	} 
	
	//check for alphnumeric names and usernames
	if(!validator.isAlphanumeric(data['first-name']) || 
		!validator.isAlphanumeric(data['last-name']) ||
		!validator.isAlphanumeric(data['username-form'])) {
		
		status['formStatus'] = "Please use only letters and numbers for username and name fields";
		status['modified'] = true;
	}
	  
	  
	
	//console.log(status);
	return status;
}

function checkAddLinkForm(data) {
	var status = {modified: false}

	var name = data['link-name'];
	var link = data['link-url'];
	var desc = data['link-desc'];
	
	if(!name) {
		status['addLinkStatus'] = "Please provide a name for this link";
		status['modified'] = true;
	}
	
	else if(!link) {
		status['addLinkStatus'] = "Please provide a link";
		status['modified'] = true;
	}
	
	else if(!validator.isURL(link)) {
		status['addLinkStatus'] = "Make sure the link provided is a URL (includes the 'http://' part)";
		status['modified'] = true;
	}
	
	return status;
}

//sanitize form data
//runs through each value in a post form and sanitizes it
function sanitizeForm(data) {

	for (var x in data) {
		data[x] = validator.escape(data[x]);
	}
	
	return data;
}

function titleCase(str) {
	var split = str.split(' ');
	for(var i = 0; i < split.length; i++) {
		split[i] = split[i].charAt(0).toUpperCase() + split[i].substr(1).toLowerCase();
	}
	
	return split.join(' ');
}


/*********************************************************88
* Error logging methods
*/
//function to handle error logging
//for now just console.log, but could change to more advanced logging later
function logErrors(err) {
	//console.log(err);
}

