import { ExperimentForm } from '@/components/faculty/ExperimentForm';

import { EMPTY_EXPERIMENT_FORM } from '../../../services/experimentAuthoring';

export default function CreateExperiment() {
  return <ExperimentForm mode="create" initialValues={EMPTY_EXPERIMENT_FORM} />;
}
