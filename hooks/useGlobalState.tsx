import {
  createContext,
  FunctionComponent,
  useContext,
  useMemo,
  useReducer,
} from 'react'
import equal from 'fast-deep-equal'
import merge from 'deepmerge'

export const GlobalStateContext = createContext({})

const reducer = (state: object, newState: object): object => {
  if (equal(state, newState)) return state
  return merge(state, newState)
}

type GlobalStateProviderProps = {
  children: FunctionComponent
  initialState: Object
}

export const GlobalStateProvider = ({
  children,
  initialState = {},
}: GlobalStateProviderProps) => {
  const [state, setState] = useReducer(reducer, initialState)

  const value = useMemo(() => [state, setState], [state])

  return (
    <GlobalStateContext.Provider value={value}>
      {children}
    </GlobalStateContext.Provider>
  )
}

const useGlobalState = () => {
  const context = useContext(GlobalStateContext)
  if (!context) throw Error('useGlobalState must be used within a context')
  return context
}

export default useGlobalState
