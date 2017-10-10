module.exports = {

	setup: function(db) {
		//People(id, username, password, first_name, last_name, hour, teacher, email, permission)
		db.run("create table if not exists People (" +
				"id integer primary key autoincrement," +
				"username varchar(50) not null unique, password varchar(50) not null," +
				"first_name varchar(50) not null, last_name varchar(50) not null," + 
				"hour integer not null, teacher integer default -1 not null," +
				"email varchar(50), permission varchar(20) not null," +
				"foreign key(teacher) references People(id) on update cascade on delete set default" +
				");"
				, [], function(err) {
					//console.log(err);
				});
		
		//CourseLinks(id, name, link, description)
		db.run("create table if not exists CourseLinks (" + 
				"id integer primary key autoincrement," +
				"name varchar(100) not null unique, link varchar(255) not null, description varchar(255)" +
				");"
				, [], function(err) {
					//console.log(err);
				});
		
		//Books(id, title, author_first, author_last, pages)
		//title is the input title typed
		//searchtitle is all caps for search ease
		db.run("create table if not exists Books (" + 
				"id integer primary key autoincrement," +
				"title varchar(100) not null, author_first varchar(50) not null," +
				"author_last varchar(50) not null, pages integer," + 
				"genre varchar(50)," +
				"constraint unique_book unique(title, author_first, author_last)" +
				");"
				, [], function(err) {
					//console.log(err);
				});
			
		//Reviews(id, writer, book, score, date, text)
		//when inserting date, use SELECT date('now')
		//ex. insert into Reviews values(writerid, bookid, text, score, select date('now'));
		//default value on writer is for if a user is removed - still want review and score,
		//and can list this as 'Anonymous'. Also can allow anonymous posts.
		db.run("create table if not exists Reviews (" +
				"id integer primary key autoincrement," +
				"writer integer default -1 not null, book integer not null," +
				"score integer not null check(score >= 1 and score <= 10)," +
				"date text not null," +
				"text varchar(255) not null," +
				"foreign key(writer) references People(id) on update cascade on delete set default," +
				"foreign key(book) references Books(id) on update cascade on delete cascade," +
				"constraint unique_review unique(writer, book)" +
				");"
				, [], function(err) {
					//console.log(err);
				});
		
		//Documents(id, person, date, assignment_name, path, original_name, link_path)
		db.run("create table if not exists Documents (" +
				"id integer primary key autoincrement," +
				"person integer not null, date text not null, assignment_name varchar(50) default 'Unspecified'," +
				//"path varchar(100) not null, original_name varchar(100), 
				"link_path varchar(100)," +
				"foreign key(person) references People(id) on delete cascade on update cascade" +
				");"
				, [], function(err) {
					//console.log(err);
				});
				
		//Announcements(id, poster, date, title, content)
		db.run("create table if not exists Announcements (" +
				"id integer primary key autoincrement," +
				"poster integer not null, date text not null, title varchar(30)," +
				"content varchar(255)," +
				"foreign key(poster) references People(id) on update cascade on delete cascade" +
				");"
				, [], function(err) {
					//console.log(err);
				});
		
		//AdminConfig(student_key, admin_key)
		db.run("create table if not exists AdminConfig(" +
				"student_key varchar(20), admin_key varchar(20)" +
				");"
				, [], function(err) {
					//console.log(err);
				});
		
		db.run("pragma foreign_keys = 1;");
	
	}, //end setup funciton
	
	testLoad: function(db) {
	
		/*
		db.run("insert into CourseLinks values(null, 'x', 'y', 'z');", [], function(err) {
			//console.log(err);
		});
		
		db.run("insert into AdminConfig(student_key, admin_key) values('student', 'admin');", [], function(err) {
			//console.log(err);
		});
		
		db.run("insert into CourseLinks(name, link, description) " +
			"values('Citation', 'http://www.citationmachine.net/', 'Generate citations.');", 
			[], function(err) {
			//console.log(err);
		});
		
		db.run("insert into CourseLinks(name, link, description) " +
			"values('Be Verbs', 'http://www.stlcc.edu/Student_Resources/Academic_Resources/Writing_Resources/Grammar_Handouts/To-be-Verbs.pdf', 'Learn to replace be verbs with stronger verbs.');", 
			[], function(err) {
			//console.log(err);
		});
		db.all("select * from AdminConfig;" , [], function(err, rows) {
			//console.log("People");
			//console.log(err);
			console.log(rows);
		});
		db.all("select * from Announcements;" , [], function(err, rows) {
			//console.log("Links");
			//console.log(err);
			console.log(rows);
		});
		
		var sql = "select Announcements.id, Announcements.date, Announcements.content, \
				   People.first_name, People.last_name \
				   from Announcements join People on Announcements.poster = People.id";
		db.all(sql , [], function(err, rows) {
			//console.log("Links");
			//console.log(err);
			console.log(rows);
		});
		
		//db.all("insert into Books values(null, 'Book1', 'Billy', 'Author', 'BOOK1');");
		
		db.all("insert into Reviews (id, book, score, text, date) values(null, 1, 3, 'Text', datetime('now', 'localtime'));" ,
			[], function(err, rows) {
			//console.log("Links");
			console.log(err);
			console.log(rows);
		});
		db.all("select * from Books", [], function(err, rows) {
			//console.log("Links");
			console.log(err);
			console.log(rows);
		});
		db.all("select * from People", [], function(err, rows) {
			//console.log("Links");
			console.log(err);
			console.log(rows);
		});
		var sql = "select Person.first as first, Person.last as last, Person.teacher as teacher, \
			   Person.hour as hour, \
			   Reviews.id as rid, Reviews.date as date, \
			   Books.title as title, Books.id as bid \
			   from (select Student.first_name as first, Student.last_name as last, \
			   Student.hour as hour, Teacher.last_name as teacher \
			   from People as Student join People as Teacher on Student.teacher = Teacher.id) as Person \
			   join (Reviews join Books on Reviews.book = Books.id) \
			   order by Reviews.date desc";
		db.all(sql, function(err, rows) {
			console.log(err);
			console.log(rows);
		});
		db.all("select * from People where permission = 'admin'", function(err, rows) {
			//console.log(err);
			console.log(rows);
		});
		*/
		
	},
	
	//used to start new year with new students
	/*******
	* TODO: Test this
	*/
	clearStudentData: function(db, rimraf, dataPath) {
		
		//for each person who is not an admin, delete folder with their documents (if they have any)
		db.each("select id from People where permission != 'admin'", function(err, row) {
			if(err) { console.log(err); }
			
			else {
				db.serialize(function() {
				db.all("select id from Documents where Documents.person = ?", [row.id], function(err, rows) {
					if(err) { console.log(err); }
					
					//if this person has any Documents
					if(rows.length > 0) {
						//delete that users documents folder
						rimraf(dataPath + 'uploads' + row.id, function(err) {
							if(err) { console.log(err); }
						});
					}
				});
				
				db.run("delete from Documents where Documents.person = ?", [row.id], function(err) {
					if(err) { console.log(err); }
				});
				
				}); //end db.serialize
			}
		});
		
		//delete entries from user tables
		db.run("delete from People where permission != 'admin';");
		db.run("delete from Announcements");
	},
	
	//remove all tables and re-add them
	rebuild: function(db, rimraf, dataPath) {
		db.serialize(function() {
		
		try {
			rimraf(dataPath + 'uploads', function(err) {
				if(err) { console.log(err); }
			});
		} catch(e) {
			console.log(e);
		}
		
		//drop all tables and re-create them
		db.each("select * from sqlite_master where type='table';", function(err, row) {
		
			if(err) {
				console.log(err);
			}
			
			else {
				if(row.name != 'sqlite_sequence') {
					var sql = "drop table if exists " + row.name;
					db.run(sql, function(err) {
						if(err) { console.log(err); }
					});
				}
			}
		
		});
		
		eval(module.exports.setup(db));
		
		//People(id, username, pass, first, last, hour, teacher, email, permission)
		db.run("insert into People values(null, 'Webmaster', 'eb0a191797624dd3a48fa681d3061212', \
			    'Web', 'Master', 1, 1, '', 'admin');", function(err) {
			
			if(err) { console.log(err); }
		});
		
		/*
		db.run("insert into People values(null, 'Teacher', 'eb0a191797624dd3a48fa681d3061212', \
			    'Mr.', 'Teacher', 1, 2, '', 'admin');", function(err) {
			
			if(err) { console.log(err); }
		});
		*/
		
		//enter Anonymous as a person to make reviews work correctly
		db.run("insert into People values(-1, 'Anonymous', 'eb0a191797624dd3a48fa681d3061212', \
			    'Anonymous', 'User', 1, -1, '', 'student');", function(err) {
			
			if(err) { console.log(err); }
		});
		
		db.run("insert into AdminConfig(student_key, admin_key) values('student', 'admin');", [], function(err) {
			if(err) { console.log(err); }
		});
		
		}); //end serialize
	
	}
}