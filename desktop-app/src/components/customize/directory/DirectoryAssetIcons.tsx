import React from 'react';

import closeIcon from '@/assets/customization/directory-controls/close.svg';
import downloadIcon from '@/assets/customization/directory-controls/download.svg';
import navConnectorsIcon from '@/assets/customization/directory-nav/connectors.svg';
import navPluginsIcon from '@/assets/customization/directory-nav/plugins.svg';
import navSkillsIcon from '@/assets/customization/directory-nav/skills.svg';
import pluginApolloIcon from '@/assets/customization/plugin-icons/apollo.svg';
import pluginBioResearchFill from '@/assets/customization/plugin-icons/bio-research-fill.svg';
import pluginCommonRoomIcon from '@/assets/customization/plugin-icons/common-room.svg';
import pluginCustomerSupportFill from '@/assets/customization/plugin-icons/customer-support-fill.svg';
import pluginDataIcon from '@/assets/customization/plugin-icons/data.svg';
import pluginDesignIcon from '@/assets/customization/plugin-icons/design.svg';
import pluginEngineeringIcon from '@/assets/customization/plugin-icons/engineering.svg';
import pluginEnterpriseSearchIcon from '@/assets/customization/plugin-icons/enterprise-search.svg';
import pluginFinanceFill from '@/assets/customization/plugin-icons/finance-fill.svg';
import pluginFinanceOverlay from '@/assets/customization/plugin-icons/finance-overlay.svg';
import pluginHumanResourcesIcon from '@/assets/customization/plugin-icons/human-resources.svg';
import pluginMarketingIcon from '@/assets/customization/plugin-icons/marketing.svg';
import pluginOperationsIcon from '@/assets/customization/plugin-icons/operations.svg';
import pluginPdfViewerIcon from '@/assets/customization/plugin-icons/pdf-viewer.svg';
import pluginProductManagementIcon from '@/assets/customization/plugin-icons/product-management.svg';
import pluginProductivityFill from '@/assets/customization/plugin-icons/productivity-fill.svg';
import pluginSlackIcon from '@/assets/customization/plugin-icons/slack.svg';
import pluginZoomIcon from '@/assets/customization/plugin-icons/zoom.svg';
import searchIcon from '@/assets/customization/directory-controls/search.svg';
import chevronDownIcon from '@/assets/customization/directory-controls/chevron-down.svg';

export type DirectoryNavIconKey = 'skills' | 'connectors' | 'plugins';
export type DirectoryUtilityIconKey = 'close' | 'search' | 'chevron-down' | 'download';
export type DirectoryPluginIconKey =
  | 'productivity'
  | 'design'
  | 'marketing'
  | 'data'
  | 'engineering'
  | 'finance'
  | 'product-management'
  | 'operations'
  | 'enterprise-search'
  | 'human-resources'
  | 'pdf-viewer'
  | 'customer-support'
  | 'apollo'
  | 'slack'
  | 'common-room'
  | 'bio-research'
  | 'zoom';

interface DirectoryIconProps {
  className?: string;
}

const navIcons: Record<DirectoryNavIconKey, string> = {
  skills: navSkillsIcon,
  connectors: navConnectorsIcon,
  plugins: navPluginsIcon,
};

const utilityIcons: Record<DirectoryUtilityIconKey, string> = {
  close: closeIcon,
  search: searchIcon,
  'chevron-down': chevronDownIcon,
  download: downloadIcon,
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function AssetImage({ src, className }: { src: string; className?: string }) {
  return <img src={src} alt="" aria-hidden="true" className={joinClasses('block shrink-0 object-contain', className)} />;
}

export function DirectoryNavIcon({ className, icon }: DirectoryIconProps & { icon: DirectoryNavIconKey }) {
  return <AssetImage src={navIcons[icon]} className={className} />;
}

export function DirectoryUtilityIcon({ className, icon }: DirectoryIconProps & { icon: DirectoryUtilityIconKey }) {
  return <AssetImage src={utilityIcons[icon]} className={className} />;
}

export function DirectoryPluginIcon({ className, icon }: DirectoryIconProps & { icon: DirectoryPluginIconKey }) {
  const wrapperClassName = joinClasses('relative h-full w-full', className);

  switch (icon) {
    case 'productivity':
      return (
        <div className={wrapperClassName}>
          <AssetImage src={pluginProductivityFill} className="absolute inset-0 h-full w-full" />
        </div>
      );
    case 'design':
      return <AssetImage src={pluginDesignIcon} className={className} />;
    case 'marketing':
      return <AssetImage src={pluginMarketingIcon} className={className} />;
    case 'data':
      return <AssetImage src={pluginDataIcon} className={className} />;
    case 'engineering':
      return <AssetImage src={pluginEngineeringIcon} className={className} />;
    case 'finance':
      return (
        <div className={wrapperClassName}>
          <AssetImage src={pluginFinanceFill} className="absolute inset-0 h-full w-full" />
          <AssetImage src={pluginFinanceOverlay} className="absolute inset-0 h-full w-full" />
        </div>
      );
    case 'product-management':
      return <AssetImage src={pluginProductManagementIcon} className={className} />;
    case 'operations':
      return <AssetImage src={pluginOperationsIcon} className={className} />;
    case 'enterprise-search':
      return <AssetImage src={pluginEnterpriseSearchIcon} className={className} />;
    case 'human-resources':
      return <AssetImage src={pluginHumanResourcesIcon} className={className} />;
    case 'pdf-viewer':
      return <AssetImage src={pluginPdfViewerIcon} className={className} />;
    case 'customer-support':
      return (
        <div className={wrapperClassName}>
          <AssetImage src={pluginCustomerSupportFill} className="absolute inset-0 h-full w-full" />
        </div>
      );
    case 'apollo':
      return <AssetImage src={pluginApolloIcon} className={className} />;
    case 'slack':
      return <AssetImage src={pluginSlackIcon} className={className} />;
    case 'common-room':
      return <AssetImage src={pluginCommonRoomIcon} className={className} />;
    case 'bio-research':
      return (
        <div className={wrapperClassName}>
          <AssetImage src={pluginBioResearchFill} className="absolute inset-0 h-full w-full" />
        </div>
      );
    case 'zoom':
      return <AssetImage src={pluginZoomIcon} className={className} />;
    default:
      return null;
  }
}
