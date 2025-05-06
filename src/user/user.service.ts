import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserSignUpDTO } from './dtos/userSignup.dto';
import { NotFoundResponse, MethodNotAllowedResponse } from '../common/errors';
import { ChangePasswordDTO, LocationDTO, UpdatePersonalInfoDTO } from './dtos';
import { FirebaseService } from 'src/firebase/firebase.service';
import * as bcrypt from 'bcrypt';
import { OAuthType, WalletStatus, WalletTransactionType } from '@prisma/client';
import { PaginationDTO } from 'src/auction/dtos';
import { PaginationService } from 'src/common/services/pagination.service';
import { WalletService } from 'src/wallet/wallet.service';
import { EmailsType } from 'src/auth/enums/emails-type.enum';
import { EmailSerivce } from 'src/emails/email.service';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(
    private prismaService: PrismaService,
    private firebaseService: FirebaseService,
    private walletService: WalletService,
    private paginationService: PaginationService,
    private emailService: EmailSerivce,
    private readonly whatsappService: WhatsAppService,
  ) {}

  async register(UserSignData: UserSignUpDTO, hashedPassword: string) {
    const { userName, email, phone } = UserSignData;
    // Check email
    const isEmailExist = await this.findUserByEmail(email);
    if (isEmailExist)
      throw new MethodNotAllowedResponse({
        ar: 'البريد الالكتروني مسجل من قبل',
        en: 'Email is already exist',
      });

    // Check phone
    const isPhoneExist = await this.findUserByPhone(phone);
    if (isPhoneExist)
      throw new MethodNotAllowedResponse({
        ar: 'الهاتف مسجل من قبل',
        en: 'Phone is already exist',
      });

    // Create User
    const user = await this._create(userName, email, hashedPassword, phone);

    return user;
  }

  async saveExcelData(data: any[], categoryId: number) {
    const failedEntries: any[] = [];
    const successEntries: any[] = [];

    // Process and clean data
    for (const row of data) {
      try {
        const mobiles = this.extractMobileNumbers(row['MOBILE NUMBER']);
        const entries = mobiles.map((mobile) => ({
          name: row['NAME'] || null,
          mobile: mobile || null,
          email: row['EMAIL'] || null,
          address: row['ADDRESS'] || null,
          companyName: row['COMPANY NAME'] || null,
          remarks: row['REMARKS'] || null,
          categoryId: categoryId,
        }));

        // Try to create each entry
        for (const entry of entries) {
          try {
            const result = await this.prismaService.nonRegisteredUser.create({
              data: entry,
            });
            successEntries.push(result);
          } catch (error) {
            // Log more detailed error information
            this.logger.error(
              `Failed to insert: ${JSON.stringify(entry)}\nError details: ${
                error.message
              }\nError code: ${error.code}\nError meta: ${JSON.stringify(
                error.meta,
              )}`,
              error,
            );
            failedEntries.push({ ...entry, error: error.message });
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to process row: ${JSON.stringify(row)}`,
          error,
        );
        failedEntries.push(row);
      }
    }

    return {
      message: 'Data upload completed',
      successCount: successEntries.length,
      failedCount: failedEntries.length,
      failedEntries: failedEntries.length ? failedEntries : 'No errors',
    };
  }

  // New extractMobileNumbers function
  private extractMobileNumbers(mobileField: any): string[] {
    try {
      if (!mobileField) return [];

      // Convert to string if it's a number
      const mobileString = mobileField.toString();

      // First split by common delimiters
      const numbers = mobileString
        .split(/\/|\n|,|\s+/)
        .map((num: any) => num.trim())
        .filter((num: any) => num.length > 0);

      // Process and validate each number
      return numbers
        .map((number: any) => {
          try {
            // Remove all hyphens and spaces
            let cleanNumber = number.replace(/-|\s/g, '');

            // Handle different formats and convert to standard format
            if (cleanNumber.startsWith('+971')) {
              // Format: +971XXXXXXXXX
              cleanNumber = cleanNumber;
            } else if (cleanNumber.startsWith('971')) {
              // Format: 971XXXXXXXXX
              cleanNumber = '+' + cleanNumber;
            } else if (cleanNumber.startsWith('0')) {
              // Format: 05XXXXXXXX
              cleanNumber = '+971' + cleanNumber.substring(1);
            } else if (cleanNumber.match(/^[5][0-9]{8}$/)) {
              // Format: 5XXXXXXXX
              cleanNumber = '+971' + cleanNumber;
            }

            // Validate UAE mobile number format
            const uaeRegex = /^\+971[5][0-9]{8}$/;
            return uaeRegex.test(cleanNumber) ? cleanNumber : null;
          } catch (error) {
            this.logger.error(`Failed to process number: ${number}`, error);
            return null;
          }
        })
        .filter((num): num is string => num !== null); // Remove invalid numbers
    } catch (error) {
      this.logger.error(
        `Failed to process mobile field: ${mobileField}`,
        error,
      );
      return [];
    }
  }

  async oAuth(
    email: string,
    phone: string,
    userName: string,
    oAuthType: OAuthType,
  ) {
    // Create User
    console.log('new user register 2');
    const user = await this.prismaService.user.create({
      data: {
        ...(email ? { email: email } : {}),
        ...(phone ? { phone: phone } : {}),
        ...(userName ? { userName: userName } : {}),
        isOAuth: true,
        isVerified: true,
        oAuthType,
      },
    });
    if (user) {
      //send a welcome email
      // const emailBodyToNewUser = {
      //   subject: 'Welcome to Alle Tre!',
      //   title: 'We’re Excited to Have You Onboard!',
      //   message: `
      //     Hi ${userName},

      //     Welcome to Alle Tre! We’re thrilled to have you as part of our growing community. Whether you're here to explore, buy, or sell, we’re here to support you every step of the way.

      //     Start discovering amazing auctions, creating your own, and connecting with a vibrant community of auction enthusiasts. Your journey begins now, and we’re excited to see you succeed!

      //     If you ever have questions or need assistance, our team is just a click away.
      //   `,
      //   Button_text: 'Get Started',
      //   Button_URL: process.env.FRONT_URL,
      // };
      const emailBodyToNewUser = {
        subject: 'Welcome to Alle Tre!',
        title: 'We’re Excited to Have You Onboard!',
        userName: `${user.userName}`,
        message1: `
          Welcome to Alle Tre! We’re thrilled to have you as part of our growing community. Whether you're here to explore, buy, or sell, we’re here to support you every step of the way.
      
          Start discovering amazing auctions, creating your own, and connecting with a vibrant community of auction enthusiasts. Your journey begins now, and we’re excited to see you succeed!
          
          If you ever have questions or need assistance, our team is just a click away. 
        `,
        message2: `
          <h3>What’s Next?</h3>
          <ul>
            <li>1. <b>Explore More Auctions</b>: Browse our platform for more items you’ll love.</li>
            <li>2. <b>Bid Smarter</b>: Use the “Buy Now” feature or set higher auto-bids to secure your favorite items next time.</li>
          </ul>
          <p>Thank you for Joining our platform. We look forward to seeing you in future bids!</p>
           <p style="margin-bottom: 0;">Best regards,</p>
       <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
          <p>P.S. If you have any questions or need assistance, don’t hesitate to contact our support team.</p>
        `,
        Button_text: 'Browse Auctions',
        Button_URL: 'https://www.alletre.com',
      };
      this.emailService.sendEmail(
        email,
        'token',
        EmailsType.OTHER,
        emailBodyToNewUser,
      );
      const whatsappBodyForNewUserWelcome = {
        1: `👋 Hi ${user.userName}, welcome to *alletre*!`,
        2: `We are thrilled to have you onboard. Whether you are here to explore buy or sell we are here to support you every step of the way.`,
        3: `Start discovering amazing auctions creating your own and connecting with a vibrant community of auction enthusiasts.`,
        4: `Need help anytime? Our support team is just a click away.`,
        5: `Here is what you can do next:`,
        6: `• Explore more auctions and find items you will love • Use buy now or set higher auto bids to win your favorite items`,
        7: `Thanks again for joining us. We look forward to seeing you in future bids.`,
        8: `https://www.alletre.com`,
      };

      if (user.phone) {
        await this.whatsappService.sendOtherUtilityMessages(
          whatsappBodyForNewUserWelcome,
          user.phone,
          'alletre_common_utility_templet',
        );
      }
    }
    if (user && user.id <= 100) {
      const newUserWalletData = {
        status: WalletStatus.DEPOSIT,
        transactionType: WalletTransactionType.By_AUCTION,
        description: 'Welcome Bonus',
        amount: 100,
        auctionId: null,
        balance: 100,
      };
      const addedBonus = await this.walletService.create(
        user.id,
        newUserWalletData,
      );
      return { user, addedBonus };
    }
    return { user, addedBonus: null };
  }

  async findUserByEmail(email: string) {
    return await this.prismaService.user.findFirst({
      where: { email: email.toLocaleLowerCase() },
    });
  }
  async findUserByPhone(phone: string) {
    return await this.prismaService.user.findFirst({
      where: { phone: phone },
    });
  }

  async checkEmailVerification(email: string) {
    const user = await this.prismaService.user.findFirst({
      where: { email: email },
    });
    return user.isVerified ? true : false;
  }

  async findUserByEmailOr404(email: string) {
    const user = await this.prismaService.user.findFirst({
      where: { email: email.toLocaleLowerCase() },
      include: {
        wallet: true,
      },
    });
    if (!user)
      throw new NotFoundResponse({
        ar: 'البريد الالكتروني غير مسجل من قبل',
        en: 'Email is not exist',
      });

    return user;
  }
  async findUserByPhoneOr404(phone: string) {
    const user = await this.prismaService.user.findFirst({
      where: { phone: phone },
    });
    if (!user)
      throw new NotFoundResponse({
        ar: 'الهاتف غبر مسجل من قبل',
        en: 'Phone is not exist',
      });
  }

  async findUserProfileByIdOr404(id: number) {
    const user = await this.prismaService.user.findUnique({
      where: { id: id },
    });
    if (!user)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا المستخدم',
        en: 'User not found',
      });

    return this.exclude(user, ['password']);
  }

  async findUserByIdOr404(id: number) {
    const user = await this.prismaService.user.findUnique({
      where: { id: id },
    });
    if (!user)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا المستخدم',
        en: 'User not found',
      });

    return user;
  }

  async verifyUserEmail(email: string) {
    try {
      console.log('verify user');
      const user = await this.prismaService.user.update({
        where: { email: email },
        data: { isVerified: true },
      });

      return { status: 'SUCCESS', user };
    } catch (error) {
      return { status: 'FAILED' };
    }
  }
  async updateUserIpAddress(userId: number, ipAddress: string) {
    await this.prismaService.user.update({
      where: { id: userId },
      data: { ipAddress },
    });
  }
  async updateUserCredentials(email: string, hashedPassword: string) {
    try {
      await this.prismaService.user.update({
        where: { email: email },
        data: { password: hashedPassword },
      });
    } catch (error) {
      console.log(error);

      throw new MethodNotAllowedResponse({
        ar: 'خطأ في تعديل بياناتك',
        en: 'Failed while updating your info',
      });
    }
  }

  async addNewLocation(userId: number, locationDTO: LocationDTO) {
    const {
      address,
      addressLabel,
      cityId,
      countryId,
      zipCode,
      phone,
      lat,
      lng,
    } = locationDTO;

    try {
      const userLocations = await this.prismaService.location.findMany({
        where: { userId },
      });

      if (userLocations.length) {
        await this.prismaService.location.create({
          data: {
            userId: userId,
            address,
            cityId,
            countryId,
            ...(zipCode ? { zipCode } : {}),
            addressLabel,
            phone,
            ...(lat ? { lat } : {}),
            ...(lng ? { lng } : {}),
          },
        });
      } else {
        await this.prismaService.$transaction([
          this.prismaService.location.create({
            data: {
              userId: userId,
              address,
              cityId,
              countryId,
              ...(zipCode ? { zipCode } : {}),
              addressLabel,
              phone,
              lat,
              lng,
              isMain: true,
            },
          }),

          this.prismaService.user.update({
            where: { id: userId },
            data: { hasCompletedProfile: true, phone: phone.toString() },
          }),
        ]);
      }
    } catch (error) {
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في إضافة العنوان الخاص بك',
        en: 'Something went wrong while adding your location',
      });
    }
  }

  async getAllUserLocations(userId: number) {
    return await this.prismaService.location.findMany({
      where: { userId },
      include: { country: true, city: true },
    });
  }

  async updateUserLocation(
    userId: number,
    locationId: number,
    locationDTO: LocationDTO,
  ) {
    const { address, addressLabel, cityId, countryId, zipCode, phone } =
      locationDTO;

    await this._isMyLocation(userId, locationId);
    await this._isLocationRelatedToAuction(locationId);
    // await this.prismaService.user.update({
    //   where: { id: userId },
    //   data: { phone: phone.toString() },
    // });
    return await this.prismaService.location.update({
      where: { id: locationId },
      data: {
        address,
        cityId,
        countryId,
        ...(zipCode ? { zipCode } : {}),
        addressLabel,
        phone,
      },
    });
  }

  async updatePersonalInfo(
    userId: number,
    updatePersonalInfoDTO: UpdatePersonalInfoDTO,
    image?: Express.Multer.File,
  ) {
    const { userName, phone } = updatePersonalInfoDTO;
    const user = await this.findUserByIdOr404(userId);

    let uploadedImage: any;
    if (image) {
      // Delete saved Image from firebase
      if (user.imagePath)
        await this.firebaseService.deleteFileFromStorage(user.imagePath);

      // Upload new one
      uploadedImage = await this.firebaseService.uploadImage(image);
    }
    // Check phone
    if (phone) {
      const userWithSamePhone = await this.findUserByPhone(phone);
      if (userWithSamePhone && userWithSamePhone.id !== userId)
        throw new MethodNotAllowedResponse({
          ar: 'الهاتف مسجل من قبل',
          en: 'Phone is already exist',
        });
    }

    // Update profile
    const updatedUser = await this.prismaService.user.update({
      where: { id: Number(userId) },
      data: {
        ...(uploadedImage ? { imageLink: uploadedImage.fileLink } : {}),
        ...(uploadedImage ? { imagePath: uploadedImage.filePath } : {}),
        ...(userName ? { userName } : {}),
        ...(phone ? { phone } : {}),
      },
    });

    return this.exclude(updatedUser, ['password']);
  }

  async changePassword(userId: number, changePasswordDTO: ChangePasswordDTO) {
    const { newPassword, oldPassword } = changePasswordDTO;
    const user = await this.findUserByIdOr404(userId);

    if (!user.password)
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في بيانات المستخدم',
        en: 'You Have No Saved Password',
      });

    //  Compare oldPassword with userPassword
    const isPasswordMatches = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordMatches)
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في بيانات المستخدم',
        en: 'Invalid Old Password',
      });

    // Hash Password
    const hashedPassword = await bcrypt.hash(
      newPassword,
      parseInt(process.env.SALT),
    );

    const updatedUser = await this.prismaService.user.update({
      where: { id: Number(userId) },
      data: {
        password: hashedPassword,
      },
    });

    return this.exclude(updatedUser, ['password']);
  }

  async setLocationAsMainLocation(userId: number, locationId: number) {
    // Check location authorization
    await this._isMyLocation(userId, locationId);

    // Update all locations to false and set location to main
    try {
      await this.prismaService.$transaction([
        this.prismaService.location.updateMany({
          where: { userId: userId },
          data: { isMain: false },
        }),

        this.prismaService.location.update({
          where: { id: locationId },
          data: { isMain: true },
        }),

        this.prismaService.user.update({
          where: { id: userId },
          data: { hasCompletedProfile: true },
        }),
      ]);
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ طارئ خلال تعديل عنوانك',
        en: 'Failed while trying to update your location',
      });
    }
  }

  async deleteLocationById(userId: number, locationId: number) {
    await this._isMyLocation(userId, locationId);
    await this._isLocationRelatedToAuction(locationId);
    await this._isMainLocation(locationId);

    await this.prismaService.location.delete({ where: { id: locationId } });
  }

  private async _create(
    userName: string,
    email: string,
    hashedPassword: string,
    phone: string,
  ) {
    return await this.prismaService.user.create({
      data: {
        email: email.toLocaleLowerCase(),
        phone: phone,
        userName: userName,
        password: hashedPassword,
      },
    });
  }

  private async _isMyLocation(userId: number, locationId: number) {
    const location = await this.prismaService.location.findUnique({
      where: { id: Number(locationId) },
    });
    if (!location)
      throw new NotFoundResponse({
        ar: 'هذا العنوان غير مسجل من قبل',
        en: 'Location Is NotFound',
      });

    if (location.userId !== Number(userId))
      throw new MethodNotAllowedResponse({
        ar: 'هذا العنوان غير مصرح لك',
        en: 'You Are Not Authorized Access To Location',
      });
  }

  private async _isLocationRelatedToAuction(locationId: number) {
    const isLocationRelatedToAuction =
      await this.prismaService.auction.findFirst({
        where: { locationId: locationId },
      });
    if (isLocationRelatedToAuction)
      throw new MethodNotAllowedResponse({
        ar: 'هذا العنوان تم تعينه مع إعلان من قبل',
        en: 'This Location Is Already Related To Auction',
      });
  }

  private async _isMainLocation(locationId: number) {
    const isMainLocation = await this.prismaService.location.findUnique({
      where: { id: locationId },
    });
    if (isMainLocation.isMain)
      throw new MethodNotAllowedResponse({
        ar: 'لايمكنك حذف عنوانك الرئيسي',
        en: 'You Can Not Delete Your Main Location',
      });
  }

  async getAllUsers(paginationDTO: PaginationDTO, name?: string) {
    const { page = 1, perPage = 10 } = paginationDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );
    console.log('limit', limit);
    const users = await this.prismaService.user.findMany({
      where: {
        ...(name
          ? { userName: { startsWith: name, mode: 'insensitive' } }
          : {}),
      },
      select: {
        id: true,
        userName: true,
        email: true,
        phone: true,
        imageLink: true,
        isVerified: true,
        createdAt: true,
        isBlocked: true,
        _count: { select: { auctions: true, JoinedAuction: true } },
        wallet: true,
      },
      take: limit,
      skip,
    });

    const count = await this.prismaService.user.count({
      where: { ...(name ? { userName: { startsWith: name } } : {}) },
    });
    return {
      pagination: this.paginationService.getPagination(count, page, perPage),
      users,
    };
  }

  async getAllNonRegisteredUsers(paginationDTO: PaginationDTO, name?: string) {
    const { page = 1, perPage = 10 } = paginationDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );
    console.log('limit', limit);
    const users = await this.prismaService.nonRegisteredUser.findMany({
      where: {
        ...(name ? { name: { startsWith: name, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        createdAt: true,
      },
      take: limit,
      skip,
    });

    const count = await this.prismaService.nonRegisteredUser.count({
      where: { ...(name ? { name: { startsWith: name } } : {}) },
    });
    return {
      pagination: this.paginationService.getPagination(count, page, perPage),
      users,
    };
  }

  // Exclude keys from user
  exclude<User, Key extends keyof any>(
    user: any,
    keys: Key[],
  ): Omit<User, Key> {
    for (const key of keys) {
      delete user[key];
    }
    return user;
  }

  async addNewSubscriber(email: string) {
    try {
      console.log('addNewSubscriber===========>**', email);
      const isEmailExist = await this.prismaService.subscribedUser.findFirst({
        where: { email: email },
      });
      if (isEmailExist) {
        if (isEmailExist.isActive) {
          throw new MethodNotAllowedResponse({
            ar: 'البريد الالكتروني مسجل من قبل',
            en: 'Email is already exist',
          });
        } else {
          return await this.prismaService.subscribedUser.update({
            where: {
              email: email,
            },
            data: {
              isActive: true,
            },
          });
        }
      }
      return await this.prismaService.subscribedUser.create({
        data: { email, isActive: true },
      });
    } catch (error) {
      console.log('addNewSubscriber===========>', error.response.message);
      throw new MethodNotAllowedResponse({
        ar: error.response.message.ar || 'خطأ في إضافة المشترك',
        en: error.response.message.en || 'Failed while adding new subscriber',
      });
    }
  }
  async unSubscribeUser(email: string) {
    try {
      const isEmailExist = await this.prismaService.subscribedUser.findFirst({
        where: { email: email },
      });
      console.log('is email exist ', isEmailExist);
      if (!isEmailExist.isActive) {
        console.log('is email exist 2', isEmailExist);
        throw new MethodNotAllowedResponse({
          ar: 'هذا البريد الإلكتروني غير موجود',
          en: 'This email does not exist',
        });
      }
      const isUnSubscribeUser = await this.prismaService.subscribedUser.update({
        where: {
          email: email,
        },
        data: {
          isActive: false,
        },
      });
      return isUnSubscribeUser;
    } catch (error) {
      console.log('Error at unsubscribe user :', error);
      throw new MethodNotAllowedResponse({
        ar: error.response.message.ar,
        en: error.response.message.en,
      });
    }
  }
  async updateBlockStatus(userId: number, currentStatus: boolean) {
    try {
      const user = await this.prismaService.user.update({
        where: {
          id: userId,
        },
        data: {
          isBlocked: !currentStatus,
        },
      });
      console.log('user is blocked ', user);
      if (user) {
        return user;
      }
    } catch (error) {
      console.log('Error at updateBlockStatus user :', error);
      throw new MethodNotAllowedResponse({
        ar: '',
        en: error,
      });
    }
  }
}
