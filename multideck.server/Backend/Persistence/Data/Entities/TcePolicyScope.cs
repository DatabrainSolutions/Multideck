using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TcePolicyScope
{
    public Guid TcepolicyScopeId { get; set; }

    public Guid TcepolicyScopePolicyId { get; set; }

    public string TcepolicyScopeName { get; set; } = null!;

    public Guid? TcepolicyScopeOrgOfficeId { get; set; }

    public Guid? TcepolicyScopeLegalEntityId { get; set; }

    public Guid? TcepolicyScopeBrandId { get; set; }

    public Guid? TcepolicyScopeCustomerOrgId { get; set; }

    public string? TcepolicyScopeModeCode { get; set; }

    public string? TcepolicyScopeDirectionCode { get; set; }

    public string? TcepolicyScopeShipmentTypeCode { get; set; }

    public string? TcepolicyScopeOriginCountryCode { get; set; }

    public string? TcepolicyScopeDestinationCountryCode { get; set; }

    public string? TcepolicyScopeTransitCountryCode { get; set; }

    public decimal? TcepolicyScopeMinShipmentValueAmount { get; set; }

    public string? TcepolicyScopeCurrencyCodeSnapshot { get; set; }

    public int TcepolicyScopePriority { get; set; }

    public bool TcepolicyScopeIsDefault { get; set; }

    public bool TcepolicyScopeIsActive { get; set; }

    public string TcepolicyScopeConditionsJson { get; set; } = null!;

    public DateTime TcepolicyScopeCreatedAt { get; set; }

    public Guid? TcepolicyScopeCreatedBy { get; set; }

    public virtual CmpBrand? TcepolicyScopeBrand { get; set; }

    public virtual CmpUser? TcepolicyScopeCreatedByNavigation { get; set; }

    public virtual OrgMaster? TcepolicyScopeCustomerOrg { get; set; }

    public virtual CmpLegalEntity? TcepolicyScopeLegalEntity { get; set; }

    public virtual CmpOffice? TcepolicyScopeOrgOffice { get; set; }

    public virtual TceScreeningPolicy TcepolicyScopePolicy { get; set; } = null!;
}
