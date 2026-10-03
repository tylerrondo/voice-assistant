if (candidateResolution.status === 'CANDIDATE_UNAVAILABLE') {
  return {
    status: 'CANDIDATE_UNAVAILABLE',
    targetId: candidateResolution.targetId,
    offerId: candidateResolution.targetId, // compatibility mirror
    message: candidateResolution.message
  };
}
