import {
  DiffAddedIcon,
  DiffIgnoredIcon,
  DiffModifiedIcon,
  DiffRemovedIcon,
  DiffRenamedIcon,
} from '@primer/octicons-react'
import React from 'react'
import { Icon } from '../Icon'

const iconMap = {
  added: DiffAddedIcon,
  ignored: DiffIgnoredIcon,
  modified: DiffModifiedIcon,
  removed: DiffRemovedIcon,
  renamed: DiffRenamedIcon,
}

export const DiffIcon: React.FC<{
  diff: Required<TreeNode>['diff']
}> = ({ diff: { status } }) => <Icon className={status} IconComponent={iconMap[status]} />
