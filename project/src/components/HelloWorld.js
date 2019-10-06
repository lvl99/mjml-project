const { registerDependencies } = require("mjml-validator");
const { BodyComponent } = require("mjml-core");

registerDependencies({
  "mj-hello-world": [],
  "mj-body": ["mj-hello-world"],
  "mj-wrapper": ["mj-hello-world"]
});

class MjHelloWorld extends BodyComponent {
  render() {
    /**
     * It's possible to use Twig {{ keyword }} interpolation within your
     * MJML component's output.
     */
    return this.renderMJML(`
      <mj-section>
        {{ example }} {{ project }}
      </mj-section>
    `);
  }
}

// Static
MjHelloWorld.endingTag = false;

module.exports = MjHelloWorld;
