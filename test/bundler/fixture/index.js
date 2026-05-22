/* consumer fixture — aliases @adobe/aio-lib-files to local stub */
import * as files from "@adobe/aio-lib-files";
console.log("keys:", Object.keys(files).join(","));
console.log(files.init ? "has-init" : "no-init");
