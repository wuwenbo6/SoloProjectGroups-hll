#pragma once

#include "ptp_types.h"
#include <functional>
#include <string>
#include <vector>

namespace ptp {

struct StateTransition {
    PortState from;
    PortState to;
    std::string reason;
    std::chrono::steady_clock::time_point timestamp;
};

class StateMachine {
public:
    explicit StateMachine(PortState initial = PortState::LISTENING);

    PortState current_state() const { return state_; }

    void transition_to(PortState newState, const std::string& reason);

    bool can_transition_to(PortState newState) const;

    const std::vector<StateTransition>& history() const { return history_; }

    std::function<void(PortState from, PortState to, const std::string& reason)> on_transition;

private:
    PortState state_;
    std::vector<StateTransition> history_;
};

}
