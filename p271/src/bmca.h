#pragma once

#include "ptp_types.h"
#include <vector>
#include <optional>

namespace ptp {

struct BMCAResult {
    bool isGrandmaster = false;
    const AnnounceMessage* bestMaster = nullptr;
    std::string description;
};

class BMCA {
public:
    static int dataset_comparison(const AnnounceMessage& a, const AnnounceMessage& b);

    static BMCAResult compute_best_master(
        const DefaultDS& localDS,
        const std::vector<ForeignMasterRecord>& foreignMasters
    );

    static AnnounceMessage local_announce_from_ds(const DefaultDS& ds, uint16_t sequenceId);
};

}
