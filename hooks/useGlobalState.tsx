import merge from 'deepmerge'
import equal from 'fast-deep-equal'
import { createContext, useContext, useReducer } from 'react'

import { Range } from '../models'
import initialState from '../utils/initialState'

type GlobalState = {
  period?: string
  range?: Range
  years?: number[]
  streaks?: Range[]
}

type GlobalStateHook = [
  GlobalState,
  React.Dispatch<React.SetStateAction<GlobalState>>,
]

type GlobalStateProviderProps = {
  children: JSX.Element | JSX.Element[]
  initialState: Object
}

const defaultGlobalState: GlobalStateHook = [initialState, (): void => {}]

const GlobalStateContext = createContext<GlobalStateHook>(defaultGlobalState)

const reducer = (state: object, newState: object): object => {
  if (equal(state, newState)) return state
  return merge(state, newState)
}

export const GlobalStateProvider = ({
  children,
  initialState = {},
}: GlobalStateProviderProps) => {
  const [state, setGlobalState] = useReducer(reducer, initialState)

  return (
    <GlobalStateContext.Provider value={[state, setGlobalState]}>
      {children}
    </GlobalStateContext.Provider>
  )
}

const useGlobalState = (): GlobalStateHook => {
  return useContext(GlobalStateContext)
}

export default useGlobalState
