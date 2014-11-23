'use strict';

var _ = require('lodash');
var async = require('async');
var argv = require('yargs')
  .default({
    dist: false,
    host: 'pho3nixf1re.localtest.me',
    port: '8000'
  })
  .alias({
    d: 'dist',
    h: 'host',
    p: 'port'
  })
  .argv;

// gulp
var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var runSequence = require('run-sequence');
var wiredep = require('wiredep').stream;
var lazypipe = require('lazypipe');

// metalsmith
var gulpsmith = require('gulpsmith');
var templates = require('metalsmith-templates');

var paths = {
  output: './.tmp',
  app: 'app',
  styles: 'app/styles',
  scripts: 'app/scripts',
  templates: 'app/templates',
  content: 'app/content'
};

gulp.task('default', ['serve']);

gulp.task('watch', function watchTask(done) {
  var options = {
    emitOnGlob: false
  };

  $.watch(
    [paths.content + '/**/*', paths.templates + '/**/*'],
    options,
    function smithWatch(files, cb) {
      gulp.start('smith', cb);
    });
  $.watch(
    paths.styles + '/**/*',
    options,
    function smithWatch(files, cb) {
      gulp.start('sass', cb);
    });
  $.watch(
    paths.scripts + '/**/*', options,
    function smithWatch(files, cb) {
      gulp.start('scripts', cb);
    });

  done();
});

gulp.task('webserver', function webserverTask(done) {
  gulp.src(paths.output)
    .pipe($.webserver({
      host: argv.host,
      port: argv.port,
      livereload: true
    }));
  done();
});

gulp.task('serve', ['build', 'watch', 'webserver']);

gulp.task('openbrowser', function serveTask(done) {
  opn('http://' + argv.host + ':' + argv.port);
});

gulp.task('build', ['cleanup'], function buildTask(done) {
  gulp.start(['assets', 'smith']);
  done();
});

gulp.task('cleanup', function cleanupTask() {
  return gulp.src(paths.output, { read: false })
    .pipe($.rimraf());
});

gulp.task('smith', ['templates'], function smithTask(done) {
  var filterRenderable = $.filter('*.md');
  var templatePath = paths.output + '/templates';

  gulp.src(paths.content + '/**/*')
    .pipe($.plumber())
      .pipe(filterRenderable)
        .pipe($.frontMatter())
        .on('data', function(file) {
            _.assign(file, file.frontMatter);
            delete file.frontMatter;
        })
        .pipe($.marked({ gfm: true }))
        .pipe(gulpsmith()
          .use(templates({
            engine: 'handlebars',
            directory: templatePath
          }))
        )
      .pipe(filterRenderable.restore())
    .pipe($.plumber.stop())
    .pipe(gulp.dest(paths.output))
    .on('end', function cleanForge() {
      gulp.src(templatePath, { read: false })
        .pipe($.rimraf());
      done();
    });
});

gulp.task('wiredep', ['wiredep:templates', 'wiredep:sass']);

gulp.task('wiredep:templates', function wiredepTemplatesTask() {
  return gulp.src(paths.templates + '/*.html')
    .pipe($.plumber())
      .pipe(wiredep())
    .pipe($.plumber.stop())
    .pipe(gulp.dest(paths.templates + ''));
});

gulp.task('wiredep:sass', function wiredepSassTask() {
  var destPath = paths.styles;

  return gulp.src(paths.styles + '/main.scss')
    .pipe($.plumber())
      .pipe(wiredep())
    .pipe($.plumber.stop())
    .pipe(gulp.dest(destPath));
});

gulp.task('sass', function sassTask(done){
  var destPath = paths.output + '/styles';
  var distCssPipe = lazypipe()
    .pipe($.rubySass, { sourcemap: false })
    .pipe($.filter, ['*', '!*.map'])
    .pipe($.minifyCss);
  var devCssPipe = lazypipe()
    .pipe($.rubySass, { sourcemapPath: '.' });

  return gulp.src(paths.styles + '/main.scss')
    .pipe($.plumber())
      .pipe($.if(argv.dist,
        distCssPipe(),
        devCssPipe()
      ))
    .pipe($.plumber.stop())
    .pipe(gulp.dest(destPath));
});

gulp.task('scripts', function scriptsTask() {
  return gulp.src(paths.scripts + '/**/*')
    .pipe(gulp.dest(paths.output + '/scripts'));
});

gulp.task('assets', ['sass', 'scripts']);

gulp.task('templates', ['assets'], function templatesTask(done) {
  var assets = $.useref.assets();
  var distAssetPipe = lazypipe()
    .pipe(function cssFiles() {
      return $.if('*.css', $.minifyCss());
    })
    .pipe(function jsFiles() {
      return $.if('*.js', $.uglify());
    });
  var distPipe = lazypipe()
    .pipe($.minifyHtml, { empty: true });

  return gulp.src(paths.templates + '/**/*')
    .pipe($.plumber())
    .pipe(assets)
      .pipe($.if(argv.dist, distAssetPipe()))
      .pipe(gulp.dest(paths.output))
    .pipe(assets.restore())
    .pipe($.useref())
    .pipe($.if(argv.dist, distPipe()))
    .pipe($.if('*.html', gulp.dest(paths.output + '/templates')));
});

gulp.task('publish', function publishTask() {
  return gulp.src(paths.output + '/**/*')
    .pipe($.ghPages())
    .on('end', function deployed() {
      gulp.start('cleanup');
    });
});
