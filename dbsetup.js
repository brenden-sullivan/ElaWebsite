module.exports = {

	setup: function(db) {
		//People(id, username, password, first_name, last_name, email, permission)
		db.run("create table if not exists People (" +
				"id integer primary key autoincrement," +
				"username varchar(50) not null unique, password varchar(50) not null," +
				"first_name varchar(50) not null, last_name varchar(50) not null," + 
				"email varchar(50), permission varchar(20) not null" +
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
		
		//Books(id, title, author_first, author_last, search_title, average_score)
		//title is the input title typed
		//searchtitle is all caps for search ease
		db.run("create table if not exists Books (" + 
				"id integer primary key autoincrement," +
				"title varchar(100) not null, author_first varchar(50) not null," +
				"author_last varchar(50) not null, search_title varchar(100) not null," + 
				"constraint unique_book unique(search_title, author_first, author_last)" +
				");"
				, [], function(err) {
					//console.log(err);
				});
			
		//Reviews(id, writer, book, text, score, date)
		//when inserting date, use SELECT date('now')
		//ex. insert into Reviews values(writerid, bookid, text, score, select date('now'));
		//default value on writer is for if a user is removed - still want review and score,
		//and can list this as 'Anonymous'. Also can allow anonymous posts.
		db.run("create table if not exists Reviews (" +
				"id integer primary key autoincrement," +
				"writer integer default -1 not null, book integer not null," +
				"text varchar(255)," + 
				"score integer not null check(score >= 1 and score <= 5)," +
				"date text not null," +
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
				"path varchar(100) not null, original_name varchar(100), link_path varchar(100)," +
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
			//console.log(rows);
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
		db.all("select * from Documents", [], function(err, rows) {
			//console.log("Links");
			//console.log(err);
			console.log(rows);
		});
		*/
	},
	
	clearStudentData: function(db, fs) {
		db.run("delete from People where permission != 'admin';");
		db.run("delete from Documents");
		db.run("delete from Announcements");
		
		/********************
		* TODO: remove files from filesystem
		*/
	},
	
	rebuild: function(db) {
		db.serialize(function() {
		
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
		
		db.run("insert into People values(null, 'Webmaster', 'eb0a191797624dd3a48fa681d3061212', \
			    'Web', 'Master', '', 'admin');", function(err) {
			
			if(err) { console.log(err); }
		});
		
		db.run("insert into AdminConfig(student_key, admin_key) values('student', 'admin');", [], function(err) {
			if(err) { console.log(err); }
		});
		
		}); //end serialize
	
	}
}