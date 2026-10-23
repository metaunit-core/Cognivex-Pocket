'use strict';
// Synthetic evidence for fixtures explicitly exercising today's original flow.
module.exports = function originalLearning(state, at) {
  state.materials.forEach(material => {
    material.completedAt = at;
    material.groups.forEach(group => {
      group.firstLearningCompletedAt = at;
      group.runs = ['new','review'].map(mode => ({ mode, videoSkipped:true, outputCompleted:true, startedAt:at, completedAt:at }));
    });
  });
  return state;
};
