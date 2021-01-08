import { createContext, useContext, useMemo, useReducer, useState } from 'react'
import equal from 'deepequal'
import merge from 'deepmerge'

export const GlobalStateContext = createContext()

const reducer = (state = {}, newState = {}) => {
  if (equal(state, newState)) return state
  return merge(state, newState)
}

export const GlobalStateProvider = ({ children, initialState = {} }) => {
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
