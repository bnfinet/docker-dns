module.exports = function (grunt) {

	// Project configuration.
	grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        jshint: {
            jshintrc: '.jshintrc',
            all: ['Gruntfile.js', '*.js', 'lib/*.js']
		},
		nodemon: {
		    dev: {
		        options: {
		            file: 'server.js',
		            nodeArgs: ['--debug']
			    }
		    }
		}
	});

 
    grunt.loadNpmTasks('grunt-nodemon');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    // Default task(s).
    grunt.registerTask('default', ['nodemon'])

};