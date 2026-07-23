using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CmpCompany
{
    public Guid CompanyId { get; set; }

    public string CompanyName { get; set; } = null!;

    public virtual ICollection<AiContextRule> AiContextRules { get; set; } = new List<AiContextRule>();

    public virtual ICollection<AiContextStoreScope> AiContextStoreScopes { get; set; } = new List<AiContextStoreScope>();

    public virtual ICollection<AiConversation> AiConversations { get; set; } = new List<AiConversation>();

    public virtual ICollection<CmpBrand> CmpBrands { get; set; } = new List<CmpBrand>();

    public virtual ICollection<CmpCompanyModule> CmpCompanyModules { get; set; } = new List<CmpCompanyModule>();

    public virtual ICollection<CmpLegalEntity> CmpLegalEntities { get; set; } = new List<CmpLegalEntity>();

    public virtual ICollection<CmpOffice> CmpOffices { get; set; } = new List<CmpOffice>();

    public virtual ICollection<CmpUser> CmpUsers { get; set; } = new List<CmpUser>();

    public virtual ICollection<LocLocalisationProfile> LocLocalisationProfiles { get; set; } = new List<LocLocalisationProfile>();

    public virtual ICollection<LocProfileScope> LocProfileScopes { get; set; } = new List<LocProfileScope>();
}
