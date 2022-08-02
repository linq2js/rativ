import { atom } from "../lib/main";
import { include, item, prop, shallow, cond } from "../lib/mutation";

type Passenger = {
  weight: number;
  from: number;
  to: number;
};

type Elevator = {
  /**
   * name of elevator
   */
  name: string;
  /**
   * indicate max passengers that elevator can load
   */
  maxPassengers: number;
  /**
   * indicate max passenger weight that elevator can load
   */
  maxWeight: number;
  /**
   * current level
   */
  current: number;
  /**
   * destination level, null means idle, negative numbers mean underground levels
   */
  destination: number | null;
  /**
   * list of passengers that are inside the elevator
   */
  using: Passenger[];
  /**
   * list of passengers that are waiting for the elevator
   */
  waiting: Passenger[];
};

test("elevator", () => {
  const names = "AB".split("");

  const elevators = atom(
    // build elevator list from list of name
    names.map(
      (name) =>
        ({
          name,
          maxPassengers: 10,
          maxWeight: 500,
          current: 0,
          destination: null,
          using: [],
          waiting: [],
        } as Elevator)
    )
  );

  /**
   * find an available elevator from elevator list using custom elevatorSelector
   * @param elevatorSelector indicate how the elevator is selected
   * @returns
   */
  const findElevator = (
    elevatorSelector: (availElevators: Elevator[]) => Elevator | undefined
  ) => {
    const availElevators = elevators.state.filter((elevator) => {
      const totalWeight = elevator.using.reduce(
        (sum, pas) => pas.weight + sum,
        0
      );
      // calculate average weight of the passenger
      // because we don't know the weight of the passenger who is calling the elevator
      const avgWeight = elevator.maxWeight / elevator.maxPassengers;
      return totalWeight + avgWeight <= elevator.maxWeight;
    });
    // all elevators are full, pick first one
    if (!availElevators.length) {
      return availElevators[0];
    }
    return elevatorSelector(availElevators) ?? availElevators[0];
  };

  const nearestFirst = (availElevators: Elevator[]) => {
    // not implemented yet
    return availElevators[0];
  };

  const findNearestFloor = (current: number, passengers: Passenger[]) => {
    return passengers.map((x) => x.to - current).sort()[0] ?? null;
  };

  const callElevator = (passenger: Passenger) => {
    const elevator = findElevator(nearestFirst);

    elevators.set(
      // using item() mutation to mutate selected elevator exactly
      item(
        (x) => x === elevator,
        cond((prev) => {
          // the passenger is not on the same level as elevator level
          if (passenger.from !== elevator.current) {
            // move passenger to waiting list
            return prop(
              "waiting",
              shallow(() => [...prev.waiting, passenger])
            );
          }
          const nextUsing = [...prev.using, passenger];
          return [
            prop("destination", () =>
              findNearestFloor(prev.current, nextUsing)
            ),
            prop(
              "using",
              shallow(() => nextUsing)
            ),
          ];
        })
      )
    );
  };

  /**
   * move all elevators up/down by one level
   * @returns
   */
  const moveElevators = () => {
    let moved = 0;
    elevators.set(
      // passing true to item() mutation means mutate all items
      item(
        true,
        cond((prev) => {
          // idle
          if (prev.destination === null) {
            // nothing to update
            return;
          }

          moved++;

          // reach destination level
          if (prev.current === prev.destination) {
            const next = prev.destination;
            const hasNewPassenger = prev.waiting.some((x) => x.from === next);
            const hasDropOffPassenger = prev.using.some((x) => x.to === next);

            if (!hasNewPassenger && !hasDropOffPassenger) {
              return [
                prop("current", () => prev.destination as number),
                prop("destination", () => null),
              ];
            }

            const nextUsing = [
              // drop off passengers
              ...prev.using.filter((x) => x.to !== next),
              // pick up passengers
              ...prev.waiting.filter((x) => x.from === next),
            ];

            return [
              prop("current", () => next),
              prop(
                "using",
                shallow(() => nextUsing)
              ),
              // remove picked up passengers from waiting list
              prop(
                "waiting",
                include((x) => x.from !== next)
              ),
              prop("destination", () => findNearestFloor(next, nextUsing)),
            ];
          }

          const movingUp = prev.destination > prev.current;
          let next = movingUp ? prev.current + 1 : prev.current - 1;

          return prop("current", () => next);
        })
      )
    );
    return moved;
  };

  const p = { from: 0, to: 1, weight: 50 };
  callElevator(p);
  expect(elevators.state[0].using).toEqual([p]);
  expect(elevators.state[0].destination).toEqual(1);
  moveElevators();
  moveElevators();
  expect(elevators.state[0].using).toEqual([]);
  expect(elevators.state[0].destination).toBeNull();
});
