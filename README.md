# mjml-project

This package helps you develop MJML projects:

- Create a basic MJML project structure to bootstrap your email development
- Process your MJML files along with additional data interpolation using [Twig.js](https://npmjs.com/package/twig)
- Locally serve your processed MJML files with "hot reloading" while you develop

## Installation

```sh
npm install --save-dev mjml-project
yarn add --dev mjml-project
```

## Usage

### Create a new project

This command will bootstrap your project within a folder called `my-project`:

```sh
npx create-mjml-project my-project
```

This command will bootstrap your project in the current directory with the name `my-project`:

```sh
npx create-mjml-project my-project .
```

> **NOTE:** if using the `.` file path option, the contents of the current folder must be empty. An error will prevent you overwriting existing folder contents.

The folders it will create are:

```sh
# Contains all your MJML templates
/templates
  # Nested folders can help organise your files
  /example
    hello-world.mjml

# Any data you wish to inject into templates
/data
  # You can have shared data files which the data
  # will be included in all the processed templates
  shared.json

  # If using data interpolation within your templates,
  # you will need to match the `/templates` folder structure
  /example
    # You can also have shared data per nested folder.
    # All templates within `/templates/example` will use
    # this shared data file along with `/data/shared.json`
    # and any other data file which has the same name.
    shared.json

    # This is a template specific data file which it will
    # only be included when processing the file
    # `/templates/example/hello-world.mjml`
    hello-world.json

# Any files that won't be processed can go here
/public
  /fonts
  /images
  /styles

# The folder that will contain your processed HTML files
/build
```

### Process your MJML project into email-ready HTML

```sh
npx mjml-project process
```

This will take the contents of `/templates` and `/data` and process the files into email appropriate HTML to the `/build` folder.

### Serve files locally while developing your MJML project

```sh
npx mjml-project process --watch
```

Files are also served using [`browser-sync`](https://npmjs.com/package/browser-sync). Any changes you make to files in the `/templates` and `/data` folder will trigger those files to be updated in the browser, so you can see the fruits of your labour in real-time.

## Contribute

Have suggestions, questions or feedback? Found a bug? [Post an issue](https://github.com/lvl99/mjml-project/issues)

Added a feature? Fixed a bug? [Post a PR](https://github.com/mjml-project/barbell/compare)

## License

[Apache 2.0](/LICENSE.md)
