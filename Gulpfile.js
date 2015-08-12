'use strict';

require("harmonize")();

var path = require('path');
var _ = require('lodash');
var async = require('async');
var notifier = require('node-notifier');
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
var wiredep = require('wiredep').stream;
var lazypipe = require('lazypipe');
var vinylPaths = require('vinyl-paths');
var del = require('del');
var through = require('through2');

// metalsmith
var gulpsmith = require('gulpsmith');
var layouts = require('metalsmith-layouts');

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
    var watcherNotify = function watcherNotify(message) {
        notifier.notify({
            title: 'Gulp watcher',
            message: message
        });
    };

    $.watch(
        [
            path.join(paths.content, '**/*'),
            path.join(paths.templates, '**/*')
        ],
        options,
        function smithWatch(files, cb) {
            watcherNotify('Start smithing');
            gulp.start('smith', function smithWatchCallback() {
                watcherNotify('Finished smithing');
                cb();
            });
        });
    $.watch(
        path.join(paths.styles, '**/*'),
        options,
        function sassWatch(files, cb) {
            watcherNotify('Start assets:sass');
            gulp.start('assets:sass', function () {
                watcherNotify('Finished assets:sass');
                cb();
            });
        });
    $.watch(
        path.join(paths.scripts, '**/*'),
        options,
        function scriptsWatch(files, cb) {
            watcherNotify('Start assets:scripts');
            gulp.start('assets:scripts', function () {
                watcherNotify('Finished assets:scripts');
                cb();
            });
        });

    done();
});

gulp.task('webserver', function webserverTask() {
    return gulp.src(paths.output)
        .pipe($.webserver({
            host: argv.host,
            port: argv.port,
            livereload: true
        }));
});

gulp.task('serve', ['build', 'watch', 'webserver']);

// gulp.task('openbrowser', function serveTask(done) {
//   opn('http://' + argv.host + ':' + argv.port);
// });

gulp.task('build', ['cleanup'], function buildTask(done) {
    gulp.start(['assets', 'smith']);
    done();
});

gulp.task('cleanup', function cleanupTask() {
    return gulp.src(paths.output, { read: false })
        .pipe(vinylPaths(del));
});

gulp.task('smith', ['templates'], function smithTask(done) {
    var filterRenderable = $.filter('*.md', { restore: true });
    var templatePath = path.join(paths.output, 'templates');

    gulp.src(path.join(paths.content, '**/*'))
        .pipe($.plumber())
            .pipe(filterRenderable)
                .pipe($.frontMatter())
                .pipe(through.obj(function (file, enc, callback) {
                    if (!file.frontMatter) {
                        callback();
                    }

                    _.assign(file, file.frontMatter);
                    delete file.frontMatter;

                    callback(null, file);
                }))
                .pipe($.marked({ gfm: true }))
                .pipe(gulpsmith()
                    .use(layouts({
                        engine: 'handlebars',
                        directory: templatePath
                    }))
                )
            .pipe(filterRenderable.restore)
        .pipe($.plumber.stop())
        .pipe(gulp.dest(paths.output))
        .on('finish', function cleanForge() {
            gulp.src(templatePath, { read: false })
              .pipe(vinylPaths(del));
            done();
        });
});

gulp.task('wiredep', ['wiredep:templates', 'wiredep:sass']);

gulp.task('wiredep:templates', function wiredepTemplatesTask() {
    return gulp.src(path.join(paths.templates, '*.html'))
        .pipe($.plumber())
            .pipe(wiredep())
        .pipe($.plumber.stop())
        .pipe(gulp.dest(paths.templates));
});

gulp.task('wiredep:sass', function wiredepSassTask() {
    var destPath = paths.styles;

    return gulp.src(path.join(paths.styles, 'main.scss'))
        .pipe($.plumber())
            .pipe(wiredep())
        .pipe($.plumber.stop())
        .pipe(gulp.dest(destPath));
});

gulp.task('assets', ['assets:sass', 'assets:scripts']);

gulp.task('assets:sass', function sassTask(done) {
    var destPath = path.join(paths.output, 'styles');

    return $.rubySass(path.join(paths.styles, 'main.scss'), { sourcemap: true })
        .pipe($.plumber())
            .pipe($.if(argv.dist, $.minifyCss()))
            .pipe($.sourcemaps.write())
        .pipe($.plumber.stop())
        .pipe(gulp.dest(destPath));
});

gulp.task('assets:scripts', function scriptsTask() {
    return gulp.src(path.join(paths.scripts, '**/*.js'))
        .pipe($.sourcemaps.init())
            .pipe($.uglify())
        .pipe($.sourcemaps.write())
        .pipe(gulp.dest(path.join(paths.output, 'scripts')));
});

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

    return gulp.src(path.join(paths.templates, '**/*'))
        .pipe($.plumber())
        .pipe(assets)
            .pipe($.if(argv.dist, distAssetPipe()))
            .pipe(gulp.dest(paths.output))
        .pipe(assets.restore())
        .pipe($.useref())
        .pipe($.if(argv.dist, distPipe()))
        .pipe($.if('*.html', gulp.dest(path.join(paths.output, 'templates'))));
});

gulp.task('publish', function publishTask() {
    argv.dist = true;
    return gulp.src(path.join(paths.output, '**/*'))
        .pipe($.ghPages());
});

gulp.task('lint', function lintTask() {
    return gulp.src([
        path.join(paths.scripts, '**/*.js'),
        __filename
    ])
        .pipe($.jshint())
        .pipe($.jshint.reporter('jshint-stylish'))
        .pipe($.jscs());
});
