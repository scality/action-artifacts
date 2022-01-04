export interface InputsArtifacts {
  /**
   * The name of the artifact that will be uploaded
   */
  user: string
  password: string
  url: string
  method: (x: InputsArtifacts) => void
  method_type: string
  tag: string
  source: string
  workflow_name: string
}
