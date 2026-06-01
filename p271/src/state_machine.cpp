#include "state_machine.h"
#include <set>
#include <utility>

namespace ptp {

static const std::set<std::pair<PortState, PortState>> valid_transitions = {
    {PortState::LISTENING,    PortState::MASTER},
    {PortState::LISTENING,    PortState::UNCALIBRATED},
    {PortState::LISTENING,    PortState::SLAVE},
    {PortState::UNCALIBRATED, PortState::SLAVE},
    {PortState::UNCALIBRATED, PortState::MASTER},
    {PortState::UNCALIBRATED, PortState::LISTENING},
    {PortState::SLAVE,        PortState::UNCALIBRATED},
    {PortState::SLAVE,        PortState::MASTER},
    {PortState::SLAVE,        PortState::LISTENING},
    {PortState::MASTER,       PortState::SLAVE},
    {PortState::MASTER,       PortState::UNCALIBRATED},
    {PortState::MASTER,       PortState::LISTENING},
};

StateMachine::StateMachine(PortState initial) : state_(initial) {}

bool StateMachine::can_transition_to(PortState newState) const {
    if (state_ == newState) return true;
    return valid_transitions.count({state_, newState}) > 0;
}

void StateMachine::transition_to(PortState newState, const std::string& reason) {
    if (!can_transition_to(newState)) return;

    StateTransition t;
    t.from = state_;
    t.to = newState;
    t.reason = reason;
    t.timestamp = std::chrono::steady_clock::now();
    history_.push_back(t);

    PortState oldState = state_;
    state_ = newState;

    if (on_transition) {
        on_transition(oldState, newState, reason);
    }
}

}
