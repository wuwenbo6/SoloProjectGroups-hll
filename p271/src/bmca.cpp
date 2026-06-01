#include "bmca.h"
#include <algorithm>
#include <sstream>

namespace ptp {

int BMCA::dataset_comparison(const AnnounceMessage& a, const AnnounceMessage& b) {
    if (a.grandmasterPriority1 < b.grandmasterPriority1) return -1;
    if (a.grandmasterPriority1 > b.grandmasterPriority1) return 1;

    if (a.grandmasterClockQuality.clockClass < b.grandmasterClockQuality.clockClass) return -1;
    if (a.grandmasterClockQuality.clockClass > b.grandmasterClockQuality.clockClass) return 1;

    if (a.grandmasterClockQuality.clockAccuracy < b.grandmasterClockQuality.clockAccuracy) return -1;
    if (a.grandmasterClockQuality.clockAccuracy > b.grandmasterClockQuality.clockAccuracy) return 1;

    if (a.grandmasterPriority2 < b.grandmasterPriority2) return -1;
    if (a.grandmasterPriority2 > b.grandmasterPriority2) return 1;

    if (a.grandmasterIdentity < b.grandmasterIdentity) return -1;
    if (a.grandmasterIdentity > b.grandmasterIdentity) return 1;

    if (a.stepsRemoved < b.stepsRemoved) return -1;
    if (a.stepsRemoved > b.stepsRemoved) return 1;

    if (a.sourcePortIdentity.clockIdentity < b.sourcePortIdentity.clockIdentity) return -1;
    if (a.sourcePortIdentity.clockIdentity > b.sourcePortIdentity.clockIdentity) return 1;

    if (a.sourcePortIdentity.portNumber < b.sourcePortIdentity.portNumber) return -1;
    if (a.sourcePortIdentity.portNumber > b.sourcePortIdentity.portNumber) return 1;

    return 0;
}

AnnounceMessage BMCA::local_announce_from_ds(const DefaultDS& ds, uint16_t sequenceId) {
    AnnounceMessage msg;
    msg.sourcePortIdentity.clockIdentity = ds.clockIdentity;
    msg.sourcePortIdentity.portNumber = 1;
    msg.grandmasterPriority1 = ds.priority1;
    msg.grandmasterClockQuality = ds.clockQuality;
    msg.grandmasterPriority2 = ds.priority2;
    msg.grandmasterIdentity = ds.clockIdentity;
    msg.stepsRemoved = 0;
    msg.timeSource = 0xA0;
    msg.domainNumber = ds.domainNumber;
    msg.sequenceId = sequenceId;
    return msg;
}

BMCAResult BMCA::compute_best_master(
    const DefaultDS& localDS,
    const std::vector<ForeignMasterRecord>& foreignMasters
) {
    AnnounceMessage localAnnounce = local_announce_from_ds(localDS, 0);

    const AnnounceMessage* best = &localAnnounce;
    std::string bestSource = "local";

    for (const auto& record : foreignMasters) {
        if (!record.qualified) continue;

        int cmp = dataset_comparison(record.announce, *best);
        if (cmp < 0) {
            best = &record.announce;
            bestSource = "foreign:" + record.announce.source_identity_str();
        }
    }

    BMCAResult result;
    if (best == &localAnnounce) {
        result.isGrandmaster = true;
        result.bestMaster = nullptr;
        result.description = "Local clock is the grandmaster";
    } else {
        result.isGrandmaster = false;
        result.bestMaster = best;
        std::stringstream ss;
        ss << "Foreign master " << best->grandmaster_identity_str()
           << " (class=" << static_cast<int>(best->grandmasterClockQuality.clockClass)
           << ", priority1=" << static_cast<int>(best->grandmasterPriority1)
           << ", priority2=" << static_cast<int>(best->grandmasterPriority2)
           << ", stepsRemoved=" << best->stepsRemoved << ")";
        result.description = ss.str();
    }

    return result;
}

}
