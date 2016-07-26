var express = require('express');
var app = express();
var template = require('jade');
var http = require('http').Server(app);
var fs = require('fs');

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
//app.use('/static', express.static(__dirname + '/static'));
console.log(dataPath);
app.use('/x', express.static(dataPath));

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
			
			db.all("select id, first_name, last_name from people where permission = 'admin';", function(err, people) {
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
	try {
		var data = {
			titleString: 'Sign Up'
		};
	
		var html = template.renderFile(__dirname + '/static/signup-form.jade', data);
			
		res.send(html);
		
	} catch(e) {
		next(e);
	}

});

//signup form submit - handle posted form
app.post('/signup', function(req, res, next) {

	var formData = req.body;
	/************************
	//TODO: check for malicious form data here and scrub it
	*/
	//formData = sanitizeForm(formData);
	//console.log(formData);
	
	//check that form is correct - all required fields filled and passwords match
	//var statuses = {};
	var statuses = checkSignupForm(formData);
	
	var username = formData['username-form'];
	var password = formData['password-form'];
	var first = formData['first-name'];
	var last = formData['last-name'];
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
				//console.log("Failure");
				
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
				var stmt = db.prepare("insert into People(username, password, first_name, last_name, email, permission)" +
					"values (?,?,?,?,?,?);");
				
				stmt.all([username, hashPass, first, last, email, permission], function(err, rows) { 
					
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
app.get('/profile', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	var id = cookies.id;
	
	res.redirect('/profile/' + id);

});

app.get('/profile/*', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	
	try {
		var data = {
			titleString: 'Profile',
			view: cookies.permission,
			greetingName: cookies.name
			
		}
		
		var html = template.renderFile(__dirname + '/static/profile.jade', data);

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
		sql = "select Announcements.id, Announcements.date, Announcements.title \
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
});

//get documents page
app.get('/Documents', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');

	var sql = "select Documents.id, Documents.date, Documents.assignment_name, \
			   Documents.path, Documents.original_name, People.first_name, People.last_name \
			   from Documents join People on Documents.person = People.id \
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
app.post('/documents-upload', upload.single('file'), function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	
	var formData = req.body;
	var file = req.file;
	
	db.serialize(function() {
	//Documents(id, person, date, assignment_name, path, original_name)
	db.run("insert into Documents values(?,?, datetime('now', 'localtime'),?,?,?)", 
		[null, cookies.id, formData['assignment'], file.path, file.originalname],
		function(err) {
			if(err) { logErrors(err); }
		}
	);
	
	var sql = "select Documents.id, Documents.date, Documents.assignment_name, \
			   Documents.path, Documents.original_name, People.first_name, People.last_name \
			   from Documents join People on Documents.person = People.id \
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
				console.log("status");
				console.log(status);
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
//rebuild database (drop tables, rebuild them, and add webmaster account and signup keys)
app.post('/database/rebuild', function(req, res, next) {
	var cookies = cookie.parse(req.headers.cookie || '');
	
	if(cookies.permission == 'admin') {
		dbsetup.rebuild(db);
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
						titleString: 'Profile',
						view: cookies.permission,
						greetingName: cookies.name,
						
						sqlStatus: err
					}
					
					var html = template.renderFile(__dirname + '/static/profile.jade', data);

					res.send(html);
				} catch(e) {
					next(e);
				}
			}
			
			//else reload with status of success
			else {
				try {
					var data = {
						titleString: 'Profile',
						view: cookies.permission,
						greetingName: cookies.name,
						
						sqlStatus: "Success"
					}
					
					var html = template.renderFile(__dirname + '/static/profile.jade', data);

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
				titleString: 'Profile',
				view: cookies.permission,
				greetingName: cookies.name,
				
				clearStudentStatus: "Success"
			}
			
			var html = template.renderFile(__dirname + '/static/profile.jade', data);

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
	console.log("Pre-sanitize");
	console.log(data)

	for (var x in data) {
		data[x] = validator.escape(data[x]);
	}
	
	console.log("Post-sanitize");
	console.log(data)
	
	return data;
}

//function to handle error logging
//for now just console.log, but could change to more advanced loggin later
function logErrors(err) {
	console.log(err);
}

