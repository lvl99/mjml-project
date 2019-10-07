import { registerDependencies } from "mjml-validator";
import { BodyComponent } from "mjml-core";

registerDependencies({
  "mj-hello-world": [],
  "mj-body": ["mj-hello-world"],
  "mj-wrapper": ["mj-hello-world"]
});

export default class MjHelloWorld extends BodyComponent {
  static endingTag = false;

  render() {
    /**
     * It's possible to use Twig {{ keyword }} interpolation and other
     * features within your MJML component's output.
     */
    return this.renderMJML(`
      <mj-section>
        <mj-text>
          <p>{{ example }}</p>
        </mj-text>
      </mj-section>
    `);
  }
}
